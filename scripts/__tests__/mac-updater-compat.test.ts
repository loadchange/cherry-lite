import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as path from 'node:path'
import { runInNewContext } from 'node:vm'

import type * as BuilderRuntimeModule from 'builder-util-runtime'
import type { AppUpdater } from 'electron-updater'
import type * as GitHubProviderModule from 'electron-updater/out/providers/GitHubProvider'
import type * as UpdaterProviderModule from 'electron-updater/out/providers/Provider'
import { describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const { GitHubProvider } = requireFromTest(
  'electron-updater/out/providers/GitHubProvider'
) as typeof GitHubProviderModule
const providerModule = requireFromTest('electron-updater/out/providers/Provider') as typeof UpdaterProviderModule
const macUpdaterPath = requireFromTest.resolve('electron-updater/out/MacUpdater')
const requireFromUpdater = createRequire(macUpdaterPath)
const runtimeModule = requireFromUpdater('builder-util-runtime') as typeof BuilderRuntimeModule

const version = '2.0.22'
const tag = `v${version}`
const checksum = (fill: number) => Buffer.alloc(64, fill).toString('base64')
const legacyRepoUrl = 'https://github.com/loadchange/cherry-studio-lite'

// The old v2.0.19 client uses this repository alias and updater 6.7.0. These are
// fixture hashes only: this suite resolves artifacts but must never download them.
const fixtureYaml = `version: ${version}
files:
  - url: Cherry-Lite-${version}-x64.zip
    sha512: ${checksum(1)}
    size: 123456
  - url: Cherry-Lite-${version}-arm64.zip
    sha512: ${checksum(2)}
    size: 234567
  - url: Cherry-Lite-${version}-x64.dmg
    sha512: ${checksum(3)}
    size: 345678
  - url: Cherry-Lite-${version}-arm64.dmg
    sha512: ${checksum(4)}
    size: 456789
path: Cherry-Lite-${version}-x64.zip
sha512: ${checksum(1)}
releaseDate: '2026-09-06T00:00:00.000Z'
`

function makeUpdateInfo() {
  return {
    ...providerModule.parseUpdateInfo(
      fixtureYaml,
      'latest-mac.yml',
      new URL(`${legacyRepoUrl}/releases/download/${tag}/latest-mac.yml`)
    ),
    tag
  }
}

type UpdateInfo = ReturnType<typeof makeUpdateInfo>
type ResolvedFile = ReturnType<InstanceType<typeof GitHubProvider>['resolveFiles']>[number]
type Machine = { name: string; arch: 'x64' | 'arm64'; rosetta: boolean; expectedArch: 'x64' | 'arm64' }
type Selection = { fileExtension: string; fileInfo: ResolvedFile }
type DownloadOptions = {
  updateInfoAndProvider: { provider: InstanceType<typeof GitHubProvider>; info: UpdateInfo }
  disableDifferentialDownload: boolean
}

const machines: Machine[] = [
  { name: 'Intel', arch: 'x64', rosetta: false, expectedArch: 'x64' },
  { name: 'Apple Silicon', arch: 'arm64', rosetta: false, expectedArch: 'arm64' },
  { name: 'Rosetta', arch: 'x64', rosetta: true, expectedArch: 'arm64' }
]

/**
 * Run the installed MacUpdater's real selection method, without constructing an
 * updater. All native/IO dependencies are closed mocks; executeDownload captures
 * the selected file before any task, cache write or native Squirrel API can run.
 */
function createSelectionHarness(machine: Machine) {
  const request = vi.fn(async () => {
    throw new Error('Network requests are forbidden in this offline compatibility test')
  })
  const provider = new GitHubProvider(
    { provider: 'github', owner: 'loadchange', repo: 'cherry-studio-lite' },
    { channel: 'latest', allowPrerelease: false } as AppUpdater,
    {
      platform: 'darwin',
      isUseMultipleRangeRequest: false,
      executor: { request } as unknown as UpdaterProviderModule.ProviderRuntimeOptions['executor']
    }
  )
  const execFileSync = vi.fn((command: string, args: string[]) => {
    if (command === 'sysctl' && args[0] === 'sysctl.proc_translated') {
      return `sysctl.proc_translated: ${machine.rosetta ? 1 : 0}`
    }
    if (command === 'uname' && args[0] === '-a') {
      return machine.arch === 'arm64' ? 'Darwin test ARM64' : 'Darwin test x86_64'
    }
    throw new Error(`Unexpected system command: ${command}`)
  })
  const dependencies: Record<string, unknown> = {
    'builder-util-runtime': runtimeModule,
    'fs-extra': {},
    fs: {},
    path,
    http: {},
    './AppUpdater': { AppUpdater: class {} },
    './providers/Provider': providerModule,
    child_process: { execFileSync },
    crypto: {}
  }
  const module = {
    exports: {} as { MacUpdater: { prototype: { doDownloadUpdate: (options: DownloadOptions) => Promise<Selection> } } }
  }
  runInNewContext(
    readFileSync(macUpdaterPath, 'utf8'),
    {
      module,
      exports: module.exports,
      process: { arch: machine.arch },
      require: (id: string) => {
        if (!Object.hasOwn(dependencies, id)) throw new Error(`Unmocked MacUpdater dependency: ${id}`)
        return dependencies[id]
      }
    },
    { filename: macUpdaterPath, timeout: 1000 }
  )
  const executeDownload = vi.fn(async ({ fileExtension, fileInfo }: Selection): Promise<Selection> => {
    return { fileExtension, fileInfo }
  })
  const updater = { debug: vi.fn(), _logger: { info: vi.fn(), warn: vi.fn() }, executeDownload }
  return {
    request,
    executeDownload,
    select: (info: UpdateInfo): Promise<Selection> =>
      module.exports.MacUpdater.prototype.doDownloadUpdate.call(updater, {
        updateInfoAndProvider: { provider, info },
        disableDifferentialDownload: true
      })
  }
}

describe('macOS release compatibility with the existing updater', () => {
  it.each(machines)('reproduces the DMG-only release failure on $name', async (machine) => {
    const harness = createSelectionHarness(machine)
    const info = makeUpdateInfo()
    info.files = info.files.filter((file) => file.url.endsWith('.dmg'))
    info.path = info.files[0].url
    info.sha512 = info.files[0].sha512

    await expect(harness.select(info)).rejects.toMatchObject({ code: 'ERR_UPDATER_ZIP_FILE_NOT_FOUND' })
    expect(harness.executeDownload).not.toHaveBeenCalled()
    expect(harness.request).not.toHaveBeenCalled()
  })

  describe.each(['generated', 'reversed', 'DMG first'] as const)('%s metadata ordering', (order) => {
    it.each(machines)('selects the correct ZIP on $name', async (machine) => {
      const harness = createSelectionHarness(machine)
      const info = makeUpdateInfo()
      if (order === 'reversed') info.files.reverse()
      if (order === 'DMG first') {
        info.files = [
          ...info.files.filter((file) => file.url.endsWith('.dmg')),
          ...info.files.filter((file) => file.url.endsWith('.zip'))
        ]
      }
      const selection = await harness.select(info)
      const filename = `Cherry-Lite-${version}-${machine.expectedArch}.zip`

      expect(selection.fileExtension).toBe('zip')
      expect(selection.fileInfo.url.href).toBe(`${legacyRepoUrl}/releases/download/${tag}/${filename}`)
      expect(selection.fileInfo.info).toEqual({
        url: filename,
        sha512: checksum(machine.expectedArch === 'x64' ? 1 : 2),
        size: machine.expectedArch === 'x64' ? 123456 : 234567
      })
      expect(harness.executeDownload).toHaveBeenCalledOnce()
      expect(harness.request).not.toHaveBeenCalled()
    })
  })

  it('does not fall back to an Intel ZIP when arm64 metadata exists but its ZIP is missing', async () => {
    const harness = createSelectionHarness(machines[1])
    const info = makeUpdateInfo()
    info.files = info.files.filter((file) => !file.url.endsWith('arm64.zip'))

    await expect(harness.select(info)).rejects.toMatchObject({ code: 'ERR_UPDATER_ZIP_FILE_NOT_FOUND' })
    expect(harness.executeDownload).not.toHaveBeenCalled()
    expect(harness.request).not.toHaveBeenCalled()
  })
})
