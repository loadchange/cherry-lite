import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { TtsSettings } from '@shared/tts'
import { safeStorage } from 'electron'

/** Small OS-encrypted store, separate from portable preferences and audio cache. */
export class TtsCredentialStore {
  constructor(private readonly filePath: string) {}

  private key(settings: TtsSettings): string {
    // Never send a saved key to a newly entered endpoint without an explicit save.
    return createHash('sha256')
      .update(JSON.stringify([settings.provider, settings.baseUrl.replace(/\/+$/, ''), settings.region]))
      .digest('hex')
  }

  private read(): Record<string, string> {
    try {
      const value: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'))
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.values(value).some((v) => typeof v !== 'string')
      ) {
        throw new Error('Invalid credential store')
      }
      return value as Record<string, string>
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw new Error('Cannot read the TTS credential store. Restore it or configure a new key.')
    }
  }

  has(settings: TtsSettings): boolean {
    return !!this.read()[this.key(settings)]
  }

  resolve(settings: TtsSettings): string | undefined {
    const encrypted = this.read()[this.key(settings)]
    if (!encrypted) return undefined
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch {
      throw new Error('The TTS API key cannot be unlocked on this device. Save it again in Read Aloud settings.')
    }
  }

  save(settings: TtsSettings, apiKey: string): void {
    const entries = this.read()
    const key = this.key(settings)
    if (apiKey) {
      if (
        !safeStorage.isEncryptionAvailable() ||
        (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
      ) {
        throw new Error(
          'Secure OS credential storage is unavailable. Unlock your system keyring before saving a TTS API key.'
        )
      }
      entries[key] = safeStorage.encryptString(apiKey).toString('base64')
    } else {
      delete entries[key]
    }
    mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 })
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`
    writeFileSync(temporaryPath, JSON.stringify(entries), { mode: 0o600 })
    renameSync(temporaryPath, this.filePath)
  }
}
