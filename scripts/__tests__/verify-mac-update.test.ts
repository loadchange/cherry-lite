import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import { stringify } from 'yaml'

import { verifyMacUpdate } from '../verify-mac-update'

interface ArchiveEntry {
  url: string
  size: number
  sha512: string
}

interface UpdateMetadata {
  version: string
  files: ArchiveEntry[]
  path?: string
  sha512?: string
}

const VERSION = '2.0.1'
const tempDirs: string[] = []

function makeRelease() {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-mac-update-'))
  tempDirs.push(distDir)
  const files: ArchiveEntry[] = []
  for (const arch of ['arm64', 'x64']) {
    for (const format of ['zip', 'dmg']) {
      const url = `Cherry Lite-${VERSION}-${arch}.${format}`
      // Tiny synthetic bytes: these tests verify publishing integrity, not ZIP extraction.
      const bytes = Buffer.from(`test ${arch} ${format} archive`)
      fs.writeFileSync(path.join(distDir, url), bytes)
      files.push({ url, size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64') })
    }
  }
  const metadata: UpdateMetadata = { version: VERSION, files, path: files[0].url, sha512: files[0].sha512 }
  const saveMetadata = () => fs.writeFileSync(path.join(distDir, 'latest-mac.yml'), stringify(metadata))
  saveMetadata()
  return { distDir, metadata, saveMetadata }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('verifyMacUpdate', () => {
  it('accepts both architectures with correctly hashed ZIPs and DMGs', async () => {
    const { distDir, metadata } = makeRelease()
    await expect(verifyMacUpdate(distDir, VERSION)).resolves.toEqual({
      version: VERSION,
      archives: metadata.files.map(({ url }) => url).sort()
    })
  })

  it('requires DMG files even when the metadata only lists ZIPs', async () => {
    const { distDir, metadata, saveMetadata } = makeRelease()
    metadata.files = metadata.files.filter(({ url }) => url.endsWith('.zip'))
    saveMetadata()
    await expect(verifyMacUpdate(distDir, VERSION)).resolves.toMatchObject({ version: VERSION })
    fs.unlinkSync(path.join(distDir, `Cherry Lite-${VERSION}-x64.dmg`))
    await expect(verifyMacUpdate(distDir, VERSION)).rejects.toThrow(/Missing x64 DMG archive/)
  })

  it.each([['arm64', 'x64'], ['arm64'], ['x64']])('rejects missing ZIP metadata for %j', async (...arches) => {
    const { distDir, metadata, saveMetadata } = makeRelease()
    metadata.files = metadata.files.filter(({ url }) => !arches.some((arch) => url.endsWith(`-${arch}.zip`)))
    saveMetadata()
    await expect(verifyMacUpdate(distDir, VERSION)).rejects.toThrow(/Missing (arm64|x64) ZIP entry/)
  })

  it.each(['arm64.zip', 'x64.zip', 'arm64.dmg', 'x64.dmg'])('rejects a missing %s asset', async (suffix) => {
    const { distDir } = makeRelease()
    fs.unlinkSync(path.join(distDir, `Cherry Lite-${VERSION}-${suffix}`))
    await expect(verifyMacUpdate(distDir, VERSION)).rejects.toThrow(/Missing .* archive in dist/)
  })

  it('rejects a DMG-only dist even when the metadata still lists both ZIPs', async () => {
    const { distDir, metadata } = makeRelease()
    for (const { url } of metadata.files.filter(({ url }) => url.endsWith('.zip'))) {
      fs.unlinkSync(path.join(distDir, url))
    }
    await expect(verifyMacUpdate(distDir, VERSION)).rejects.toThrow(/Missing arm64 ZIP archive in dist/)
  })

  it.each(['zip', 'dmg'])('rejects an empty %s asset', async (format) => {
    const { distDir } = makeRelease()
    fs.writeFileSync(path.join(distDir, `Cherry Lite-${VERSION}-arm64.${format}`), '')
    await expect(verifyMacUpdate(distDir, VERSION)).rejects.toThrow(/nonempty regular file/)
  })

  it.each(['zip', 'dmg'])('rejects a mismatched %s size', async (format) => {
    const { distDir, metadata, saveMetadata } = makeRelease()
    metadata.files.find(({ url }) => url.endsWith(`.${format}`))!.size += 1
    saveMetadata()
    await expect(verifyMacUpdate(distDir, VERSION)).rejects.toThrow(/Archive size mismatch/)
  })

  it.each(['zip', 'dmg'])('rejects a mismatched %s SHA-512', async (format) => {
    const { distDir, metadata, saveMetadata } = makeRelease()
    metadata.files.find(({ url }) => url.endsWith(`.${format}`))!.sha512 = 'incorrect-checksum'
    saveMetadata()
    await expect(verifyMacUpdate(distDir, VERSION)).rejects.toThrow(/Archive SHA-512 mismatch/)
  })

  it('rejects the wrong release version', async () => {
    const { distDir } = makeRelease()
    await expect(verifyMacUpdate(distDir, '2.0.2')).rejects.toThrow(/Update version mismatch/)
  })

  it('rejects missing metadata', async () => {
    const { distDir } = makeRelease()
    fs.unlinkSync(path.join(distDir, 'latest-mac.yml'))
    await expect(verifyMacUpdate(distDir, VERSION)).rejects.toThrow(/Missing file: latest-mac.yml/)
  })

  it.each([undefined, [], 'not-an-array'])('rejects absent or invalid files metadata at case %#', async (files) => {
    const { distDir } = makeRelease()
    fs.writeFileSync(path.join(distDir, 'latest-mac.yml'), stringify({ version: VERSION, files }))
    await expect(verifyMacUpdate(distDir, VERSION)).rejects.toThrow(/must contain archive entries/)
  })

  it('rejects missing SHA-512 metadata', async () => {
    const { distDir, metadata, saveMetadata } = makeRelease()
    metadata.files[0].sha512 = ''
    saveMetadata()
    await expect(verifyMacUpdate(distDir, VERSION)).rejects.toThrow(/Missing SHA-512 checksum/)
  })

  it('rejects a metadata entry that names an absent asset', async () => {
    const { distDir, metadata, saveMetadata } = makeRelease()
    metadata.files[0].url = `Another App-${VERSION}-arm64.zip`
    saveMetadata()
    await expect(verifyMacUpdate(distDir, VERSION)).rejects.toThrow(/Missing archive referenced/)
  })

  it.each([
    '../outside-arm64.zip',
    '/tmp/outside-arm64.zip',
    '..\\outside-arm64.zip',
    'C:\\outside-arm64.zip',
    'https://example.com/archive.zip',
    '%2e%2e%2foutside-arm64.zip',
    'archive.zip?token=fake',
    'archive.zip#fragment',
    '%252e%252e%252foutside-arm64.zip'
  ])('rejects unsafe metadata path %s', async (url) => {
    const { distDir, metadata, saveMetadata } = makeRelease()
    metadata.files[0].url = url
    saveMetadata()
    await expect(verifyMacUpdate(distDir, VERSION)).rejects.toThrow(/Unsafe archive path/)
  })

  it('accepts URL-encoded spaces in asset names', async () => {
    const { distDir, metadata, saveMetadata } = makeRelease()
    metadata.files = metadata.files.map((entry) => ({ ...entry, url: encodeURIComponent(entry.url) }))
    metadata.path = encodeURIComponent(metadata.path!)
    saveMetadata()
    await expect(verifyMacUpdate(distDir, VERSION)).resolves.toMatchObject({ version: VERSION })
  })

  it('rejects duplicate metadata entries', async () => {
    const { distDir, metadata, saveMetadata } = makeRelease()
    metadata.files.push({ ...metadata.files[0] })
    saveMetadata()
    await expect(verifyMacUpdate(distDir, VERSION)).rejects.toThrow(/Duplicate archive entry/)
  })

  it('rejects duplicate on-disk archives for the same architecture and format', async () => {
    const { distDir } = makeRelease()
    fs.writeFileSync(path.join(distDir, `Another App-${VERSION}-arm64.zip`), 'duplicate')
    await expect(verifyMacUpdate(distDir, VERSION)).rejects.toThrow(/Duplicate arm64.zip archives/)
  })

  it('rejects a stale archive left over from another release', async () => {
    const { distDir } = makeRelease()
    fs.writeFileSync(path.join(distDir, 'Cherry Lite-1.0.0-arm64.zip'), 'stale')
    await expect(verifyMacUpdate(distDir, VERSION)).rejects.toThrow(/Unexpected macOS archive name or version/)
  })

  it.skipIf(process.platform === 'win32')('rejects a symlink in place of an archive', async () => {
    const { distDir } = makeRelease()
    const archivePath = path.join(distDir, `Cherry Lite-${VERSION}-arm64.zip`)
    fs.unlinkSync(archivePath)
    fs.symlinkSync(path.join(distDir, `Cherry Lite-${VERSION}-x64.zip`), archivePath)
    await expect(verifyMacUpdate(distDir, VERSION)).rejects.toThrow(/not a symlink/)
  })

  it('rejects a directory in place of an archive', async () => {
    const { distDir } = makeRelease()
    const archivePath = path.join(distDir, `Cherry Lite-${VERSION}-arm64.zip`)
    fs.unlinkSync(archivePath)
    fs.mkdirSync(archivePath)
    await expect(verifyMacUpdate(distDir, VERSION)).rejects.toThrow(/nonempty regular file/)
  })

  it('rejects stale legacy path/checksum fields', async () => {
    const { distDir, metadata, saveMetadata } = makeRelease()
    metadata.sha512 = 'stale-checksum'
    saveMetadata()
    await expect(verifyMacUpdate(distDir, VERSION)).rejects.toThrow(/Legacy path\/sha512/)
  })

  it('exits nonzero from the CLI when validation fails', () => {
    const { distDir } = makeRelease()
    const script = path.resolve(__dirname, '../verify-mac-update.js')
    const good = spawnSync(process.execPath, [script, distDir, VERSION], { encoding: 'utf8' })
    expect(good.status).toBe(0)
    expect(good.stdout).toContain(`Verified macOS update ${VERSION}`)
    const bad = spawnSync(process.execPath, [script, distDir, 'wrong-version'], { encoding: 'utf8' })
    expect(bad.status).toBe(1)
    expect(bad.stderr).toContain('Update version mismatch')
  })
})
