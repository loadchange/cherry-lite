import type { SerializedError } from '@renderer/types/error'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@renderer/utils/aiGeneration', () => ({
  fetchGenerate: vi.fn()
}))

vi.mock('@renderer/i18n/resolver', () => ({
  default: { t: () => 'Diagnosis model is unavailable' }
}))

// `readDefaultModel` now reads from preferenceService + dataApiService, not Redux.
// Mock the boundary directly so tests can stage the value without rewiring v2 data.
vi.mock('@renderer/utils/model', () => ({
  readDefaultModel: vi.fn().mockResolvedValue(undefined)
}))

// Mock logger
vi.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    })
  }
}))

import { fetchGenerate } from '@renderer/utils/aiGeneration'
import { readDefaultModel } from '@renderer/utils/model'

import { classifyErrorByAI, diagnoseError } from '../errorDiagnosis'

const mockFetchGenerate = vi.mocked(fetchGenerate)
const mockReadDefaultModel = vi.mocked(readDefaultModel)

const DEFAULT_MODEL_ID = 'openai::gpt-4o'

function makeError(overrides: Partial<SerializedError> = {}): SerializedError {
  return { name: 'Error', message: 'test error', stack: null, ...overrides }
}

const { mockGetDiagnosisModel, mockIpcRequest, mockPreferenceGet } = vi.hoisted(() => ({
  mockGetDiagnosisModel: vi.fn(),
  mockIpcRequest: vi.fn(),
  mockPreferenceGet: vi.fn()
}))
vi.mock('@data/DataApiService', () => ({
  dataApiService: { get: mockGetDiagnosisModel }
}))

vi.mock('@data/PreferenceService', () => ({
  preferenceService: { get: mockPreferenceGet }
}))

vi.mock('@renderer/ipc', () => ({
  ipcApi: { request: mockIpcRequest }
}))

describe('ErrorDiagnosisService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPreferenceGet.mockResolvedValue(DEFAULT_MODEL_ID)
    mockGetDiagnosisModel.mockResolvedValue({
      id: DEFAULT_MODEL_ID,
      name: 'GPT-4o',
      providerId: 'openai',
      apiModelId: 'gpt-4o'
    })
  })

  describe('diagnoseError', () => {
    it('returns parsed diagnosis result from AI', async () => {
      const mockResult = {
        summary: 'Auth error',
        category: 'authentication',
        explanation: 'Your API key is invalid.',
        steps: [{ text: 'Check your API key', nav: '/settings/provider' }]
      }
      mockFetchGenerate.mockResolvedValue(JSON.stringify(mockResult))

      const result = await diagnoseError(makeError(), 'en')
      expect(result.summary).toBe('Auth error')
      expect(result.category).toBe('authentication')
      expect(result.steps).toHaveLength(1)
    })

    it('strips markdown code blocks from response', async () => {
      const mockResult = {
        summary: 'Network error',
        category: 'network',
        explanation: 'Connection refused.',
        steps: [{ text: 'Check proxy' }]
      }
      mockFetchGenerate.mockResolvedValue('```json\n' + JSON.stringify(mockResult) + '\n```')

      const result = await diagnoseError(makeError(), 'en')
      expect(result.summary).toBe('Network error')
    })

    it('shows the diagnosis-model unavailable error on empty response', async () => {
      mockFetchGenerate.mockResolvedValue('')
      await expect(diagnoseError(makeError(), 'en')).rejects.toThrow('Diagnosis model is unavailable')
    })

    it('shows the diagnosis-model unavailable error on invalid JSON', async () => {
      mockFetchGenerate.mockResolvedValue('not valid json')
      await expect(diagnoseError(makeError(), 'en')).rejects.toThrow('Diagnosis model is unavailable')
    })

    it('shows the diagnosis-model unavailable error on missing required fields', async () => {
      mockFetchGenerate.mockResolvedValue(JSON.stringify({ foo: 'bar' }))
      await expect(diagnoseError(makeError(), 'en')).rejects.toThrow('Diagnosis model is unavailable')
    })

    it("resolves the user's configured chat default model without any other fallback", async () => {
      const mockResult = {
        summary: 'Error',
        category: 'unknown',
        explanation: 'Something went wrong.',
        steps: []
      }
      mockFetchGenerate.mockResolvedValue(JSON.stringify(mockResult))

      await diagnoseError(makeError(), 'en')
      expect(mockPreferenceGet).toHaveBeenCalledWith('chat.default_model_id')
      expect(mockGetDiagnosisModel).toHaveBeenCalledWith(`/models/${DEFAULT_MODEL_ID}`)
      expect(mockFetchGenerate).toHaveBeenCalledTimes(1)
      expect(mockFetchGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.objectContaining({ id: DEFAULT_MODEL_ID }),
          throwOnError: true
        })
      )
      expect(mockReadDefaultModel).not.toHaveBeenCalled()
      expect(mockIpcRequest).not.toHaveBeenCalled()
    })

    it('fails when no chat default model is configured', async () => {
      mockPreferenceGet.mockResolvedValueOnce(null)

      await expect(diagnoseError(makeError(), 'en')).rejects.toThrow('Diagnosis model is unavailable')
      expect(mockGetDiagnosisModel).not.toHaveBeenCalled()
      expect(mockFetchGenerate).not.toHaveBeenCalled()
    })

    it('fails when the configured chat default model row is missing', async () => {
      mockGetDiagnosisModel.mockResolvedValueOnce(undefined)

      await expect(diagnoseError(makeError(), 'en')).rejects.toThrow('Diagnosis model is unavailable')
      expect(mockFetchGenerate).not.toHaveBeenCalled()
      expect(mockReadDefaultModel).not.toHaveBeenCalled()
    })

    it('includes context in error info', async () => {
      const mockResult = {
        summary: 'Error',
        category: 'unknown',
        explanation: 'Something went wrong.',
        steps: []
      }
      mockFetchGenerate.mockResolvedValue(JSON.stringify(mockResult))

      await diagnoseError(makeError({ statusCode: 401 }), 'zh-CN', {
        errorSource: 'chat',
        providerName: 'openai',
        modelId: 'gpt-4'
      })

      const callArgs = mockFetchGenerate.mock.calls[0][0]
      expect(callArgs.content).toContain('openai')
      expect(callArgs.content).toContain('gpt-4')
      expect(callArgs.content).toContain('401')
    })

    it('defaults category to unknown when missing', async () => {
      mockFetchGenerate.mockResolvedValue(
        JSON.stringify({
          summary: 'Error',
          explanation: 'Something went wrong.',
          steps: []
        })
      )

      const result = await diagnoseError(makeError(), 'en')
      expect(result.category).toBe('unknown')
    })

    it('forwards responseBody and uses its quota signal in the prompt', async () => {
      mockFetchGenerate.mockResolvedValue(
        JSON.stringify({ summary: 'x', category: 'quota', explanation: 'x', steps: [] })
      )
      const providerJson = '{"error":{"type":"insufficient_quota","code":"billing_hard_limit_reached"}}'

      await diagnoseError(makeError({ statusCode: 429, responseBody: providerJson }), 'en')

      const callArgs = mockFetchGenerate.mock.calls[0][0]
      expect(callArgs.content).toContain('billing_hard_limit_reached')
      expect(callArgs.prompt).toContain('quota or account balance is exhausted')
    })

    it('does not route insufficient permissions to quota context', async () => {
      mockFetchGenerate.mockResolvedValue(
        JSON.stringify({ summary: 'x', category: 'unknown', explanation: 'x', steps: [] })
      )

      await diagnoseError(makeError({ message: 'insufficient permissions' }), 'en')

      const callArgs = mockFetchGenerate.mock.calls[0][0]
      expect(callArgs.prompt).not.toContain('quota or account balance is exhausted')
    })

    it('does not route an unqualified MCP mention to MCP context', async () => {
      mockFetchGenerate.mockResolvedValue(
        JSON.stringify({ summary: 'x', category: 'unknown', explanation: 'x', steps: [] })
      )

      await diagnoseError(makeError({ message: 'something mcp related' }), 'en')

      const callArgs = mockFetchGenerate.mock.calls[0][0]
      expect(callArgs.prompt).not.toContain('MCP (Model Context Protocol) server error')
    })

    it('routes a qualified MCP timeout to MCP context', async () => {
      mockFetchGenerate.mockResolvedValue(
        JSON.stringify({ summary: 'x', category: 'mcp', explanation: 'x', steps: [] })
      )

      await diagnoseError(makeError({ message: 'MCP server timeout' }), 'en')

      const callArgs = mockFetchGenerate.mock.calls[0][0]
      expect(callArgs.prompt).toContain('MCP (Model Context Protocol) server error')
      expect(callArgs.prompt).not.toContain('Network or proxy error')
    })

    it('forwards finishReason for safety-blocked responses', async () => {
      mockFetchGenerate.mockResolvedValue(
        JSON.stringify({ summary: 'x', category: 'content', explanation: 'x', steps: [] })
      )

      await diagnoseError(makeError({ name: 'AI_NoObjectGeneratedError', finishReason: 'SAFETY' }), 'en')

      const callArgs = mockFetchGenerate.mock.calls[0][0]
      expect(callArgs.content).toContain('SAFETY')
      expect(callArgs.prompt.toLowerCase()).toContain('safety')
    })

    it('forwards structured data as serialized JSON', async () => {
      mockFetchGenerate.mockResolvedValue(
        JSON.stringify({ summary: 'x', category: 'auth', explanation: 'x', steps: [] })
      )

      await diagnoseError(makeError({ data: { error: { code: 'invalid_api_key', message: 'Key revoked' } } }), 'en')

      const callArgs = mockFetchGenerate.mock.calls[0][0]
      expect(callArgs.content).toContain('invalid_api_key')
      expect(callArgs.content).toContain('Key revoked')
    })

    it('routes HTTP 402 to quota context instead of rate-limit context', async () => {
      mockFetchGenerate.mockResolvedValue(
        JSON.stringify({ summary: 'x', category: 'quota', explanation: 'x', steps: [] })
      )

      await diagnoseError(makeError({ statusCode: 402, message: 'Payment Required' }), 'en')

      const callArgs = mockFetchGenerate.mock.calls[0][0]
      expect(callArgs.prompt).toContain('quota or account balance is exhausted')
      expect(callArgs.prompt).not.toContain('hitting a rate limit')
    })

    it('falls back to provider and model fields on the error', async () => {
      mockFetchGenerate.mockResolvedValue(
        JSON.stringify({ summary: 'x', category: 'auth', explanation: 'x', steps: [] })
      )

      await diagnoseError(makeError({ providerId: 'anthropic', modelId: 'claude-sonnet-4-5' }), 'en')

      const callArgs = mockFetchGenerate.mock.calls[0][0]
      expect(callArgs.content).toContain('anthropic')
      expect(callArgs.content).toContain('claude-sonnet-4-5')
    })
  })

  describe('classifyErrorByAI', () => {
    it('returns an empty result instead of falling back when the default model fails', async () => {
      mockFetchGenerate.mockRejectedValue(new Error('network unavailable'))

      await expect(classifyErrorByAI(makeError(), 'en')).resolves.toBe('')
      expect(mockFetchGenerate).toHaveBeenCalledTimes(1)
      expect(mockFetchGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.objectContaining({ id: DEFAULT_MODEL_ID }),
          throwOnError: true
        })
      )
      expect(mockReadDefaultModel).not.toHaveBeenCalled()
    })
  })
})
