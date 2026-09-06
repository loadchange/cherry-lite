import { DEFAULT_TTS_SETTINGS } from '@shared/tts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TtsCredentialStore } from '../TtsCredentialStore'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  rename: vi.fn(),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  available: vi.fn()
}))
vi.mock('node:fs', () => ({
  readFileSync: mocks.read,
  writeFileSync: mocks.write,
  renameSync: mocks.rename,
  mkdirSync: vi.fn()
}))
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: mocks.available,
    encryptString: mocks.encrypt,
    decryptString: mocks.decrypt,
    getSelectedStorageBackend: () => 'gnome_libsecret'
  }
}))

describe('TtsCredentialStore', () => {
  const config = { ...DEFAULT_TTS_SETTINGS, provider: 'openai' as const }
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.read.mockImplementation(() => {
      throw Object.assign(new Error(), { code: 'ENOENT' })
    })
    mocks.available.mockReturnValue(true)
    mocks.encrypt.mockImplementation((key) => Buffer.from(`encrypted:${key}`))
    mocks.decrypt.mockImplementation((value: Buffer) => value.toString().replace('encrypted:', ''))
  })

  it('persists ciphertext atomically with private permissions, never the raw key', () => {
    const store = new TtsCredentialStore('/user/tts-credentials.json')
    store.save(config, 'private-key')
    expect(mocks.encrypt).toHaveBeenCalledWith('private-key')
    const [path, data, options] = mocks.write.mock.calls[0]
    expect(data).not.toContain('private-key')
    expect(options.mode).toBe(0o600)
    expect(mocks.rename).toHaveBeenCalledWith(path, '/user/tts-credentials.json')
    mocks.read.mockReturnValue(data)
    expect(store.resolve(config)).toBe('private-key')
    expect(store.has(config)).toBe(true)
    expect(store.resolve({ ...config, baseUrl: 'https://different.example/v1' })).toBeUndefined()
  })

  it('refuses to fall back to plaintext and allows explicit key deletion', () => {
    const store = new TtsCredentialStore('/user/tts-credentials.json')
    mocks.available.mockReturnValue(false)
    expect(() => store.save(config, 'private-key')).toThrow('Secure OS')
    expect(mocks.write).not.toHaveBeenCalled()
    store.save(config, '')
    expect(mocks.write.mock.calls[0][1]).toBe('{}')
  })

  it('does not silently overwrite malformed credential data', () => {
    mocks.read.mockReturnValue('{invalid')
    expect(() => new TtsCredentialStore('/user/tts-credentials.json').save(config, 'key')).toThrow('Cannot read')
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('does not return encryption exceptions containing secrets', () => {
    const store = new TtsCredentialStore('/user/tts-credentials.json')
    store.save(config, 'private-key')
    mocks.read.mockReturnValue(mocks.write.mock.calls[0][1])
    mocks.decrypt.mockImplementation(() => {
      throw new Error('private-key')
    })
    expect(() => store.resolve(config)).toThrow('cannot be unlocked')
  })
})
