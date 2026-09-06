import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { DEFAULT_TTS_SETTINGS } from '@shared/tts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket, { WebSocketServer } from 'ws'

import { createEdgeTtsProvider, edgeSecurityToken, parseEdgeAudioFrame } from '../edge'

const servers: WebSocketServer[] = []
const request = { text: 'Hello & 你好', voice: 'zh-CN-XiaoxiaoNeural', locale: 'zh-CN', rate: 1 }
const signal = () => new AbortController().signal

function audioFrame(bytes: Uint8Array, headers = 'Path:audio\r\nContent-Type:audio/mpeg\r\n'): Buffer {
  const header = Buffer.from(headers)
  const length = Buffer.alloc(2)
  length.writeUInt16BE(header.byteLength)
  return Buffer.concat([length, header, bytes])
}

async function server() {
  const instance = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  servers.push(instance)
  await once(instance, 'listening')
  const url = `ws://127.0.0.1:${(instance.address() as AddressInfo).port}`
  return { instance, url }
}

afterEach(async () => {
  for (const instance of servers.splice(0)) {
    for (const socket of instance.clients) socket.terminate()
    await new Promise<void>((resolve) => instance.close(() => resolve()))
  }
})

describe('Edge speech transport', () => {
  it('keeps the public security token stable for a five-minute window', () => {
    const start = Date.UTC(2026, 8, 6, 12, 0)
    expect(edgeSecurityToken(start)).toMatch(/^[0-9A-F]{64}$/)
    expect(edgeSecurityToken(start + 299_000)).toBe(edgeSecurityToken(start))
    expect(edgeSecurityToken(start + 300_000)).not.toBe(edgeSecurityToken(start))
  })

  it('decodes protocol frames and rejects truncated or non-audio frames', () => {
    expect(parseEdgeAudioFrame(audioFrame(new Uint8Array([1, 2])))).toEqual(Buffer.from([1, 2]))
    expect(parseEdgeAudioFrame(audioFrame(new Uint8Array()))).toBeNull()
    expect(() => parseEdgeAudioFrame(new Uint8Array([0, 20, 1]))).toThrow('invalid-response')
    expect(() => parseEdgeAudioFrame(audioFrame(new Uint8Array([1]), 'Path:other\r\n'))).toThrow('invalid-response')
  })

  it('sends config and escaped SSML, collects MP3 frames and completes only on turn.end', async () => {
    const { instance, url } = await server()
    const sent: string[] = []
    instance.on('connection', (socket) =>
      socket.on('message', (data) => {
        sent.push(data.toString())
        if (!data.toString().includes('Path:ssml')) return
        socket.send(audioFrame(new Uint8Array([0xff, 0xfb, 0x90, 4])))
        socket.send('Path:turn.end\r\n\r\n{}')
      })
    )
    const connect = vi.fn((_target, options) => new WebSocket(url, options))
    const provider = createEdgeTtsProvider({ connect })
    const result = await provider.synthesize(request, DEFAULT_TTS_SETTINGS, signal())
    expect(result.audio).toEqual(Buffer.from([0xff, 0xfb, 0x90, 4]))
    expect(result.mimeType).toBe('audio/mpeg')
    expect(sent).toHaveLength(2)
    expect(sent[0]).toContain('Path:speech.config')
    expect(sent[1]).toContain('Hello &amp; 你好')
    expect(connect.mock.calls[0][0]).toContain('Sec-MS-GEC=')
    expect(connect.mock.calls[0][1].followRedirects).toBe(false)
  })

  it('aborts the socket while awaiting audio and rejects late completion', async () => {
    const { instance, url } = await server()
    const controller = new AbortController()
    instance.on('connection', (socket) =>
      socket.on('message', (data) => {
        if (data.toString().includes('Path:ssml')) controller.abort()
      })
    )
    const provider = createEdgeTtsProvider({ connect: (_target, options) => new WebSocket(url, options) })
    await expect(provider.synthesize(request, DEFAULT_TTS_SETTINGS, controller.signal)).rejects.toMatchObject({
      name: 'AbortError'
    })
  })

  it('times out when the peer never sends completion', async () => {
    const { url } = await server()
    const provider = createEdgeTtsProvider({
      connect: (_target, options) => new WebSocket(url, options),
      timeoutMs: 30
    })
    await expect(provider.synthesize(request, DEFAULT_TTS_SETTINGS, signal())).rejects.toMatchObject({
      code: 'timeout'
    })
  })

  it('rejects an empty successful turn and oversized SSML input', async () => {
    const { instance, url } = await server()
    instance.on('connection', (socket) => socket.on('message', () => socket.send('Path:turn.end\r\n\r\n')))
    const provider = createEdgeTtsProvider({ connect: (_target, options) => new WebSocket(url, options) })
    await expect(provider.synthesize(request, DEFAULT_TTS_SETTINGS, signal())).rejects.toMatchObject({
      code: 'invalid-response'
    })
    await expect(
      provider.synthesize({ ...request, text: '&'.repeat(1000) }, DEFAULT_TTS_SETTINGS, signal())
    ).rejects.toMatchObject({ code: 'too-large' })
  })

  it('retries a forbidden handshake once with the service clock, without leaking its response body', async () => {
    const http = createServer()
    const sockets = new WebSocketServer({ noServer: true })
    const tokens: string[] = []
    http.on('upgrade', (req, socket, head) => {
      tokens.push(new URL(req.url!, 'http://localhost').searchParams.get('Sec-MS-GEC')!)
      if (tokens.length === 1) {
        socket.end(
          `HTTP/1.1 403 Forbidden\r\nDate: ${new Date(Date.now() + 3600_000).toUTCString()}\r\nContent-Length: 0\r\n\r\n`
        )
      } else {
        sockets.handleUpgrade(req, socket, head, (websocket) => {
          websocket.on('message', (data) => {
            if (!data.toString().includes('Path:ssml')) return
            websocket.send(audioFrame(new Uint8Array([0xff, 0xfb, 0x90, 4])))
            websocket.send('Path:turn.end\r\n\r\n')
          })
        })
      }
    })
    http.listen(0, '127.0.0.1')
    await once(http, 'listening')
    const url = `ws://127.0.0.1:${(http.address() as AddressInfo).port}`
    const provider = createEdgeTtsProvider({
      connect: (target, options) => new WebSocket(`${url}${new URL(target).search}`, options)
    })
    try {
      expect((await provider.synthesize(request, DEFAULT_TTS_SETTINGS, signal())).audio.length).toBe(4)
      expect(tokens).toHaveLength(2)
      expect(tokens[0]).not.toBe(tokens[1])
    } finally {
      for (const socket of sockets.clients) socket.terminate()
      sockets.close()
      await new Promise<void>((resolve) => http.close(() => resolve()))
    }
  })
})
