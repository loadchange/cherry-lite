/**
 * Guards the prebuilt-package check in before-pack.js. CI never runs electron-builder,
 * so this is the only place the check is exercised: it fails here if `pnpm install`
 * stopped materialising both CPU architectures for the host OS — the packaging bug that
 * shipped a macOS x64 build without `@img/sharp-darwin-x64`.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

// CJS build script — vitest interops the module.exports fine.
import { assertPrebuiltPackages } from '../before-pack'

const hostPlatform = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux'
const foreignPlatform = hostPlatform === 'darwin' ? 'win32' : 'darwin'
const legacyMacOcrVersion = '1.0.2'
const macOcrPackages = ['@napi-rs/system-ocr-darwin-arm64', '@napi-rs/system-ocr-darwin-x64']

describe('assertPrebuiltPackages', () => {
  it.each(['arm64', 'x64'])('passes for the host platform on %s', (arch) => {
    expect(() => assertPrebuiltPackages(hostPlatform, arch)).not.toThrow()
  })

  it('reports the missing packages by name', () => {
    // Only the host OS's binaries are installed (supportedArchitectures.os is `current`),
    // so another platform stands in for an install that skipped an architecture.
    expect(() => assertPrebuiltPackages(foreignPlatform, 'x64')).toThrow(
      /Missing prebuilt packages for .+-x64: .*@img\/sharp-/
    )
  })

  it('does not pack unused Lite-removed natives', () => {
    const beforePackSource = readFileSync('scripts/before-pack.js', 'utf8')
    const packageList = beforePackSource.slice(
      beforePackSource.indexOf('const packages = ['),
      beforePackSource.indexOf(']', beforePackSource.indexOf('const packages = ['))
    )
    const packageManifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>
      optionalDependencies: Record<string, string>
    }

    expect(packageList).not.toMatch(/claude-agent-sdk|anydoc|sqlite-vec/)
    expect(packageManifest.dependencies).not.toHaveProperty('@anthropic-ai/claude-agent-sdk')
    expect(packageManifest.dependencies).not.toHaveProperty('@firecrawl/anydoc')
    expect(packageManifest.dependencies).not.toHaveProperty('sqlite-vec')
    expect(Object.keys(packageManifest.optionalDependencies).join('\n')).not.toMatch(
      /claude-agent-sdk|anydoc|sqlite-vec/
    )
  })

  it('pins macOS system OCR to the legacy Accurate implementation', () => {
    const packageManifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
      optionalDependencies: Record<string, string>
    }
    const workspaceConfig = parse(readFileSync('pnpm-workspace.yaml', 'utf8')) as {
      overrides: Record<string, string>
    }

    for (const packageName of macOcrPackages) {
      expect(packageManifest.optionalDependencies[packageName]).toBe(legacyMacOcrVersion)
      expect(workspaceConfig.overrides[packageName]).toBe(legacyMacOcrVersion)
    }
  })
})
