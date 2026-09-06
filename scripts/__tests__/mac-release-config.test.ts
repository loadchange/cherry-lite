import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type WorkflowStep = {
  name?: string
  run?: string
  uses?: string
  if?: string
  'continue-on-error'?: boolean | string
  with?: Record<string, string | boolean>
}

const root = resolve(__dirname, '..', '..')
const builder = parse(readFileSync(resolve(root, 'electron-builder.yml'), 'utf8')) as {
  mac: { target: Array<string | { target: string }>; artifactName: string }
}
const workflow = parse(readFileSync(resolve(root, '.github/workflows/mac-build.yml'), 'utf8')) as {
  jobs: Record<string, { steps: WorkflowStep[] }>
}
const steps = workflow.jobs['build-mac'].steps
const publications = [
  ['artifact upload', 'actions/upload-artifact@', 'path'],
  ['GitHub Release', 'softprops/action-gh-release@', 'files']
] as const

function publicationStep(action: string): WorkflowStep {
  const matches = steps.filter((step) => step.uses?.startsWith(action))
  expect(matches, `Expected exactly one ${action} publication step`).toHaveLength(1)
  return matches[0]
}

describe('macOS release and auto-update configuration', () => {
  it('builds both the manual-install DMG and the ZIP required by electron-updater', () => {
    const targets = builder.mac.target.map((target) => (typeof target === 'string' ? target : target.target))
    expect(targets).toEqual(expect.arrayContaining(['dmg', 'zip']))
  })

  it('keeps version, CPU architecture and format distinct in artifact names', () => {
    expect(builder.mac.artifactName).toContain('${version}')
    expect(builder.mac.artifactName).toContain('${arch}')
    expect(builder.mac.artifactName).toContain('${ext}')
  })

  it('packages Apple Silicon and Intel without publishing unverified build output', () => {
    const packageSteps = steps.filter((step) => step.run?.includes('electron-builder'))
    expect(packageSteps).toHaveLength(1)
    const command = packageSteps[0].run!
    expect(command).toMatch(/\belectron-builder\b/)
    expect(command).toMatch(/(?:^|\s)--mac(?:\s|$)/)
    expect(command).toMatch(/(?:^|\s)--arm64(?:\s|$)/)
    expect(command).toMatch(/(?:^|\s)--x64(?:\s|$)/)
    expect(command).toMatch(/(?:^|\s)--publish\s+never(?:\s|$)/)
  })

  it.each(publications)('includes both installers, ZIP blockmaps and update metadata in %s', (_, action, field) => {
    const step = publicationStep(action)
    const globs = String(step.with?.[field] ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    expect(globs).toEqual(
      expect.arrayContaining(['dist/*.dmg', 'dist/*.zip', 'dist/*.zip.blockmap', 'dist/latest-mac.yml'])
    )
  })

  it('rejects missing release artifacts rather than silently publishing a partial update', () => {
    expect(publicationStep('actions/upload-artifact@').with?.['if-no-files-found']).toBe('error')
    expect(publicationStep('softprops/action-gh-release@').with?.fail_on_unmatched_files).toBe(true)
  })

  it('verifies update metadata against the stamped version after packaging and before either publication', () => {
    const verificationSteps = steps.filter((step) => step.run?.includes('scripts/verify-mac-update.js'))
    expect(verificationSteps).toHaveLength(1)
    const verification = verificationSteps[0]
    expect(verification.run).toMatch(
      /\bnode\s+scripts\/verify-mac-update\.js\s+dist\s+["']?\$\{\{\s*steps\.meta\.outputs\.version\s*\}\}["']?/
    )
    const packageIndex = steps.findIndex((step) => step.run?.includes('electron-builder'))
    expect(packageIndex).toBeGreaterThanOrEqual(0)
    expect(steps.indexOf(verification)).toBeGreaterThan(packageIndex)
    for (const [, action] of publications) {
      expect(steps.indexOf(publicationStep(action))).toBeGreaterThan(steps.indexOf(verification))
    }
  })

  it('does not allow a failed or skipped verification to be bypassed during publication', () => {
    const verification = steps.find((step) => step.run?.includes('scripts/verify-mac-update.js'))
    expect(verification).toBeDefined()
    expect(verification?.['continue-on-error'] ?? false).toBe(false)
    expect(verification?.if).toBeUndefined()
    for (const [, action] of publications) {
      // No explicit condition means GitHub's default success() guard applies.
      expect(publicationStep(action).if).toBeUndefined()
    }
  })
})
