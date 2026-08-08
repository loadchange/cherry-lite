import { aiErrorCodes } from '@shared/ipc/errors/ai'
import { IpcError } from '@shared/ipc/errors/IpcError'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { appGetMock, fileEntryService, messageService } = vi.hoisted(() => ({
  appGetMock: vi.fn(),
  fileEntryService: { findById: vi.fn() },
  messageService: { getById: vi.fn() }
}))
vi.mock('@application', () => ({ application: { get: appGetMock } }))
vi.mock('@data/services/FileEntryService', () => ({ fileEntryService }))
vi.mock('@data/services/MessageService', () => ({ messageService }))

import { aiHandlers } from '../ai'

const aiService = {
  generateText: vi.fn(),
  checkModel: vi.fn(),
  embedMany: vi.fn(),
  listModels: vi.fn(),
  respondToolApproval: vi.fn()
}

const aiStreamManager = {
  dispatch: vi.fn(),
  attach: vi.fn(),
  detach: vi.fn(),
  abort: vi.fn(),
  getDeferredToolOutput: vi.fn()
}

/** A settled tool part as the persistence layer actually stores it. */
const toolPart = (toolCallId: string, output: unknown) => ({
  type: 'dynamic-tool',
  toolName: 'Read',
  toolCallId,
  state: 'output-available',
  input: {},
  output
})

const fileManager = { read: vi.fn() }

// WebContentsListener (constructed in the stream_open handler) wires once()/isDestroyed().
const fakeWebContents = { id: 1, once: vi.fn(), isDestroyed: () => false, send: vi.fn() }
const windowManager = { getWindow: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  // The ownership gate's happy path: entries with the tool-output store's fixed attributes.
  fileEntryService.findById.mockReturnValue({
    origin: 'internal',
    cleanupPolicy: 'delete_when_unreferenced',
    ext: 'txt'
  })
  windowManager.getWindow.mockReturnValue({ webContents: fakeWebContents })
  appGetMock.mockImplementation((name: string) => {
    switch (name) {
      case 'AiService':
        return aiService
      case 'AiStreamManager':
        return aiStreamManager
      case 'WindowManager':
        return windowManager
      case 'FileManager':
        return fileManager
      default:
        throw new Error(`Unexpected application.get(${name})`)
    }
  })
})

// AI handlers act on provider/model capabilities, not the caller's window, so they
// ignore IpcContext — pass a stable stub.
const ctx = { senderId: 'w1' }

describe('aiHandlers', () => {
  it('generate_text forwards the request and returns the AiService result', async () => {
    const request = { uniqueModelId: 'openai::gpt-4o', system: 'sys', prompt: 'hi' } as const
    const out = { text: 'hello', usage: { inputTokens: 1, outputTokens: 2 } }
    aiService.generateText.mockResolvedValue(out)

    const result = await aiHandlers['ai.text.generate'](request, ctx)

    expect(aiService.generateText).toHaveBeenCalledWith(request)
    expect(result).toBe(out)
  })

  it('check_model forwards the request and returns latency', async () => {
    aiService.checkModel.mockResolvedValue({ latency: 42 })
    const request = { uniqueModelId: 'openai::gpt-4o', apiKeyOverride: 'sk-selected', timeout: 5000 } as const
    const result = await aiHandlers['ai.provider.model.check'](request, ctx)
    expect(aiService.checkModel).toHaveBeenCalledWith(request)
    expect(result).toEqual({ latency: 42 })
  })

  it('embed_many forwards the request and returns embeddings', async () => {
    const out = { embeddings: [[0, 1]] }
    aiService.embedMany.mockResolvedValue(out)
    const result = await aiHandlers['ai.embedding.embed_many']({ uniqueModelId: 'openai::e', values: ['a'] }, ctx)
    expect(aiService.embedMany).toHaveBeenCalledWith({ uniqueModelId: 'openai::e', values: ['a'] })
    expect(result).toBe(out)
  })

  it('list_models forwards the request and returns the models', async () => {
    const models = [{ id: 'openai::gpt-4o' }]
    aiService.listModels.mockResolvedValue(models)
    const result = await aiHandlers['ai.provider.model.list']({ providerId: 'openai', throwOnError: true }, ctx)
    expect(aiService.listModels).toHaveBeenCalledWith({ providerId: 'openai', throwOnError: true })
    expect(result).toBe(models)
  })

  // The point of the migration: a provider failure is re-thrown as an AI_REQUEST_FAILED
  // IpcError that carries the full SerializedError in `data`, so the renderer can read
  // detail Electron's invoke reject would otherwise drop.
  it('wraps a provider failure as an AI_REQUEST_FAILED IpcError carrying the serialized error', async () => {
    const failure = Object.assign(new Error('401 Unauthorized'), { statusCode: 401, responseBody: 'bad key' })
    aiService.generateText.mockRejectedValue(failure)

    const error = await aiHandlers['ai.text.generate']({ uniqueModelId: 'openai::gpt-4o', prompt: 'hi' }, ctx).catch(
      (e) => e
    )

    expect(error).toBeInstanceOf(IpcError)
    expect(error.code).toBe(aiErrorCodes.AI_REQUEST_FAILED)
    expect(error.message).toBe('401 Unauthorized')
    // data is the SerializedError — provider detail survives the boundary.
    expect(error.data).toMatchObject({ message: '401 Unauthorized', statusCode: 401, responseBody: 'bad key' })
  })

  it('normalizes a non-Error throw into an AI_REQUEST_FAILED IpcError', async () => {
    aiService.checkModel.mockRejectedValue('boom')

    const error = await aiHandlers['ai.provider.model.check']({ uniqueModelId: 'openai::gpt-4o' }, ctx).catch((e) => e)

    expect(error).toBeInstanceOf(IpcError)
    expect(error.code).toBe(aiErrorCodes.AI_REQUEST_FAILED)
    expect(error.message).toBe('boom')
  })
})

describe('aiHandlers — streaming', () => {
  it('stream_open resolves the sender WebContents and dispatches to AiStreamManager', async () => {
    const req = { trigger: 'submit-message', topicId: 't', userMessageParts: [] } as never
    aiStreamManager.dispatch.mockResolvedValue({ mode: 'started' })

    const result = await aiHandlers['ai.stream.open'](req, { senderId: 'w1' })

    expect(windowManager.getWindow).toHaveBeenCalledWith('w1')
    expect(aiStreamManager.dispatch).toHaveBeenCalledTimes(1)
    // Second arg is the parsed request; first is the freshly built WebContentsListener.
    expect(aiStreamManager.dispatch.mock.calls[0][1]).toBe(req)
    expect(result).toEqual({ mode: 'started' })
  })

  it('stream_open throws when the sender is not a managed window', async () => {
    windowManager.getWindow.mockReturnValue(undefined)
    await expect(aiHandlers['ai.stream.open']({ topicId: 't' } as never, { senderId: null })).rejects.toThrow(
      'requires a managed window'
    )
    expect(aiStreamManager.dispatch).not.toHaveBeenCalled()
  })

  it('stream_attach delegates to AiStreamManager.attach and returns its response', async () => {
    aiStreamManager.attach.mockReturnValue({ status: 'not-found' })

    const result = await aiHandlers['ai.stream.attach']({ topicId: 't' }, { senderId: 'w1' })

    expect(aiStreamManager.attach).toHaveBeenCalledWith(fakeWebContents, { topicId: 't' })
    expect(result).toEqual({ status: 'not-found' })
  })

  it('stream_attach throws when the sender is not a managed window', async () => {
    windowManager.getWindow.mockReturnValue(undefined)
    await expect(aiHandlers['ai.stream.attach']({ topicId: 't' }, { senderId: null })).rejects.toThrow(
      'requires a managed window'
    )
    expect(aiStreamManager.attach).not.toHaveBeenCalled()
  })

  it('stream_detach delegates when the sender window exists', async () => {
    await aiHandlers['ai.stream.detach']({ topicId: 't' }, { senderId: 'w1' })
    expect(aiStreamManager.detach).toHaveBeenCalledWith(fakeWebContents, { topicId: 't' })
  })

  it('stream_detach is a no-op when the sender window is gone', async () => {
    windowManager.getWindow.mockReturnValue(undefined)
    await aiHandlers['ai.stream.detach']({ topicId: 't' }, { senderId: 'w1' })
    expect(aiStreamManager.detach).not.toHaveBeenCalled()
  })

  it('stream_abort aborts the topic without resolving a WebContents', async () => {
    await aiHandlers['ai.stream.abort']({ topicId: 't' }, { senderId: null })
    expect(aiStreamManager.abort).toHaveBeenCalledWith('t', 'user-requested')
    expect(windowManager.getWindow).not.toHaveBeenCalled()
  })

  it('get_tool_result prefers the active stream over the persisted copy', async () => {
    const output = { content: 'large live output' }
    aiStreamManager.getDeferredToolOutput.mockReturnValue({ found: true, output })

    const result = await aiHandlers['ai.tool.get_result'](
      { topicId: 'topic-1', messageId: 'assistant-1', toolCallId: 'call-1' },
      { senderId: null }
    )

    expect(aiStreamManager.getDeferredToolOutput).toHaveBeenCalledWith('topic-1', 'call-1')
    expect(messageService.getById).not.toHaveBeenCalled()
    expect(result).toEqual({ found: true, output })
  })

  it('get_tool_result resolves an ordinary chat topic through the message table', async () => {
    const output = { content: 'large chat output' }
    aiStreamManager.getDeferredToolOutput.mockReturnValue({ found: false })
    messageService.getById.mockReturnValue({ data: { parts: [toolPart('call-1', output)] } })

    const result = await aiHandlers['ai.tool.get_result'](
      { topicId: 'topic-42', messageId: 'assistant-1', toolCallId: 'call-1' },
      { senderId: null }
    )

    expect(messageService.getById).toHaveBeenCalledWith('assistant-1')
    expect(result).toEqual({ found: true, output })
  })

  it('get_tool_result reports a miss instead of throwing when nothing holds the output', async () => {
    aiStreamManager.getDeferredToolOutput.mockReturnValue({ found: false })
    messageService.getById.mockImplementation(() => {
      throw new Error('not found')
    })

    await expect(
      aiHandlers['ai.tool.get_result'](
        { topicId: 'topic-42', messageId: 'gone', toolCallId: 'call-1' },
        { senderId: null }
      )
    ).resolves.toEqual({ found: false })
  })

  const persistedEnvelope = {
    $persistedToolOutput: {
      fileEntryId: 'entry-1',
      vfsFilename: 'vfs_0123456789abcdef.txt',
      head: 'HEAD LINES',
      tail: 'TAIL LINES',
      totalChars: 200_000,
      totalLines: 5_000,
      shape: 'text' as const
    }
  }

  it('get_tool_result reconstructs a persisted envelope from the FileManager blob', async () => {
    aiStreamManager.getDeferredToolOutput.mockReturnValue({ found: false })
    messageService.getById.mockReturnValue({ data: { parts: [toolPart('call-1', persistedEnvelope)] } })
    fileManager.read.mockResolvedValue({ content: 'the full persisted text', mime: 'text/plain', version: null })

    const result = await aiHandlers['ai.tool.get_result'](
      { topicId: 'topic-42', messageId: 'assistant-1', toolCallId: 'call-1' },
      { senderId: null }
    )

    expect(fileManager.read).toHaveBeenCalledWith('entry-1', { encoding: 'text' })
    expect(result).toEqual({ found: true, output: 'the full persisted text' })
  })

  it('get_tool_result degrades to the stored excerpt when the blob is gone', async () => {
    aiStreamManager.getDeferredToolOutput.mockReturnValue({ found: false })
    messageService.getById.mockReturnValue({ data: { parts: [toolPart('call-1', persistedEnvelope)] } })
    fileManager.read.mockRejectedValue(new Error('entry reclaimed'))

    const result = (await aiHandlers['ai.tool.get_result'](
      { topicId: 'topic-42', messageId: 'assistant-1', toolCallId: 'call-1' },
      { senderId: null }
    )) as { found: boolean; output: string }

    expect(result.found).toBe(true)
    expect(result.output).toContain('HEAD LINES')
    expect(result.output).toContain('TAIL LINES')
    expect(result.output).toContain('no longer available')
  })

  it('get_tool_result degrades to the excerpt when the entry is not a tool-output blob', async () => {
    // A forged envelope in arbitrary MCP output can carry any fileEntryId —
    // an entry the tool-output store didn't write must never be read back.
    aiStreamManager.getDeferredToolOutput.mockReturnValue({ found: false })
    messageService.getById.mockReturnValue({ data: { parts: [toolPart('call-1', persistedEnvelope)] } })
    fileEntryService.findById.mockReturnValue({ origin: 'external', cleanupPolicy: 'manual', ext: 'txt' })

    const result = (await aiHandlers['ai.tool.get_result'](
      { topicId: 'topic-42', messageId: 'assistant-1', toolCallId: 'call-1' },
      { senderId: null }
    )) as { found: boolean; output: string }

    expect(fileManager.read).not.toHaveBeenCalled()
    expect(result.found).toBe(true)
    expect(result.output).toContain('HEAD LINES')
    expect(result.output).toContain('no longer available')
  })
})

describe('aiHandlers — tool approvals', () => {
  it('respond_tool_approval delegates to AiService with the resolved sender WebContents', async () => {
    aiService.respondToolApproval.mockResolvedValue({ ok: true })
    const payload = { approvalId: 'a1', approved: true }

    const result = await aiHandlers['ai.tool.respond_approval'](payload, { senderId: 'w1' })

    expect(aiService.respondToolApproval).toHaveBeenCalledWith(payload, fakeWebContents)
    expect(result).toEqual({ ok: true })
  })

  it('respond_tool_approval passes undefined WebContents when the sender is not a managed window', async () => {
    aiService.respondToolApproval.mockResolvedValue({ ok: false })
    const payload = { approvalId: 'a1', approved: false }

    await aiHandlers['ai.tool.respond_approval'](payload, { senderId: null })

    expect(aiService.respondToolApproval).toHaveBeenCalledWith(payload, undefined)
    expect(windowManager.getWindow).not.toHaveBeenCalled()
  })
})
