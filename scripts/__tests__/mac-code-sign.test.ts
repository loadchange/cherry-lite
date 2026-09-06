import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as path from 'node:path'
import { runInNewContext } from 'node:vm'

import { describe, expect, it, vi } from 'vitest'

interface CreateKeychainOptions {
  tmpDir: Record<string, never>
  currentDir: string
  cscLink: string
  cscKeyPassword: string
  cscILink?: string
  cscIKeyPassword?: string
}

interface MacCodeSignModule {
  createKeychain: (options: CreateKeychainOptions) => Promise<{ keychainFile: string }>
}

const requireFromTest = createRequire(import.meta.url)
const requireFromBuilder = createRequire(requireFromTest.resolve('electron-builder'))
const macCodeSignPath = requireFromBuilder.resolve('app-builder-lib/out/codeSign/macCodeSign.js')

/**
 * Exercise the installed dependency, including pnpm patches. CJS require bypasses
 * ordinary Vitest module mocks, so evaluate it with a closed, mock-only require.
 * No real process environment, security command, certificate or keychain is used.
 */
function loadMacCodeSign() {
  const generatedPasswordBytes = Buffer.alloc(32, 7)
  const generatedPassword = generatedPasswordBytes.toString('base64')
  const exec = vi.fn(async (file: string, args: string[]) => {
    expect(file).toBe('/usr/bin/security')
    return args[0] === 'list-keychains' ? '"/mock/login.keychain-db"\n' : ''
  })
  const importCertificate = vi.fn(async (link: string) => `/mock/certificates/${link}.p12`)
  const randomBytes = vi.fn((size: number) => {
    expect(size).toBe(32)
    return generatedPasswordBytes
  })
  const dependencies: Record<string, unknown> = {
    'builder-util': { exec },
    '../util/dynamicImport': {},
    crypto: { createHash, randomBytes },
    'fs/promises': {},
    'lazy-val': { Lazy: class {} },
    os: { tmpdir: () => '/mock/tmp' },
    path,
    'temp-file': {},
    '../util/flags': {},
    './codesign': { importCertificate }
  }
  const module = { exports: {} as MacCodeSignModule }
  runInNewContext(
    readFileSync(macCodeSignPath, 'utf8'),
    {
      module,
      exports: module.exports,
      __dirname: path.dirname(macCodeSignPath),
      // Skip unrelated bundled root-certificate setup without changing the host env.
      process: { env: { TRAVIS: 'true' } },
      require: (id: string) => {
        if (!Object.hasOwn(dependencies, id)) {
          throw new Error(`Unmocked macCodeSign dependency: ${id}`)
        }
        return dependencies[id]
      }
    },
    { filename: macCodeSignPath, timeout: 1000 }
  )
  return { createKeychain: module.exports.createKeychain, exec, importCertificate, randomBytes, generatedPassword }
}

describe('electron-builder macOS temporary signing keychain', () => {
  it.each([
    { name: 'one password-protected certificate', passwords: ['test-application-p12-password'] },
    {
      name: 'separate application and installer certificate passwords',
      passwords: ['test-application-p12-password', 'test-installer-p12-password']
    },
    { name: 'empty certificate passwords', passwords: ['', ''] },
    {
      name: 'an installer certificate with its password omitted',
      passwords: ['test-application-p12-password', undefined]
    }
  ])('uses the generated keychain password with $name', async ({ passwords }) => {
    const { createKeychain, exec, importCertificate, randomBytes, generatedPassword } = loadMacCodeSign()
    const options: CreateKeychainOptions = {
      tmpDir: {},
      currentDir: '/mock/project',
      cscLink: 'application',
      cscKeyPassword: passwords[0] ?? '',
      ...(passwords.length === 2 ? { cscILink: 'installer', cscIKeyPassword: passwords[1] } : {})
    }
    const { keychainFile } = await createKeychain(options)
    const commands = exec.mock.calls.map(([, args]) => args)
    const creates = commands.filter(([command]) => command === 'create-keychain')
    const unlocks = commands.filter(([command]) => command === 'unlock-keychain')
    const imports = commands.filter(([command]) => command === 'import')
    const partitions = commands.filter(([command]) => command === 'set-key-partition-list')

    expect(randomBytes).toHaveBeenCalledExactlyOnceWith(32)
    expect(creates).toEqual([['create-keychain', '-p', generatedPassword, keychainFile]])
    expect(unlocks).toEqual([['unlock-keychain', '-p', generatedPassword, keychainFile]])
    expect(importCertificate).toHaveBeenCalledTimes(passwords.length)
    expect(imports).toHaveLength(passwords.length)
    for (const [index, command] of imports.entries()) {
      const certificateName = index === 0 ? 'application' : 'installer'
      expect(importCertificate).toHaveBeenNthCalledWith(index + 1, certificateName, options.tmpDir, options.currentDir)
      expect(command[1]).toBe(`/mock/certificates/${certificateName}.p12`)
      expect(command[command.indexOf('-k') + 1]).toBe(keychainFile)
      expect(command[command.indexOf('-P') + 1]).toBe(passwords[index] ?? '')
      expect(command[command.indexOf('-P') + 1]).not.toBe(generatedPassword)
    }
    expect(partitions).toHaveLength(passwords.length)
    for (const command of partitions) {
      expect(command.at(-1)).toBe(keychainFile)
      // Regression: v26.15.6 incorrectly used the P12 password here. This command
      // unlocks the keychain itself, so it must use create-keychain's random password.
      expect(command[command.indexOf('-k') + 1]).toBe(generatedPassword)
    }
  })
})
