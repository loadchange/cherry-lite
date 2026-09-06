const { createHash } = require('node:crypto')
const { createReadStream } = require('node:fs')
const fs = require('node:fs/promises')
const path = require('node:path')
const { parse } = require('yaml')

const ARCHITECTURES = ['arm64', 'x64']
const FORMATS = ['zip', 'dmg']

function archiveName(value) {
  if (typeof value !== 'string' || !value) throw new Error('Invalid archive URL in latest-mac.yml')
  let name
  try {
    name = decodeURIComponent(value)
  } catch {
    throw new Error(`Invalid archive URL encoding: ${value}`)
  }
  // Release assets live directly in dist. Reject URLs, traversal, Windows paths,
  // query strings and fragments, including their percent-encoded forms.
  if (/[\\/\u0000-\u001f\u007f:?#%]/.test(name) || name === '.' || name === '..') {
    throw new Error(`Unsafe archive path: ${value}`)
  }
  return name
}

function archiveSlot(name, version) {
  for (const arch of ARCHITECTURES) {
    for (const format of FORMATS) {
      const suffix = `-${version}-${arch}.${format}`
      if (name.endsWith(suffix) && name.length > suffix.length) return `${arch}.${format}`
    }
  }
  throw new Error(`Unexpected macOS archive name or version: ${name}`)
}

async function requireFile(filePath) {
  let stat
  try {
    stat = await fs.lstat(filePath)
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Missing file: ${path.basename(filePath)}`)
    throw error
  }
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`Expected a nonempty regular file (not a symlink): ${path.basename(filePath)}`)
  }
  return stat
}

async function verifyChecksum(filePath, entry) {
  const stat = await requireFile(filePath)
  if (!Number.isSafeInteger(entry.size) || entry.size <= 0 || entry.size !== stat.size) {
    throw new Error(`Archive size mismatch: ${entry.url}`)
  }
  if (typeof entry.sha512 !== 'string' || !entry.sha512) {
    throw new Error(`Missing SHA-512 checksum: ${entry.url}`)
  }
  const hash = createHash('sha512')
  let bytesRead = 0
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk)
    bytesRead += chunk.length
  }
  if (bytesRead !== entry.size) throw new Error(`Archive size changed while verifying: ${entry.url}`)
  if (hash.digest('base64') !== entry.sha512) throw new Error(`Archive SHA-512 mismatch: ${entry.url}`)
}

/** Verify macOS manual-install and auto-update artifacts before publishing. */
async function verifyMacUpdate(distDir = 'dist', expectedVersion = require('../package.json').version) {
  if (typeof expectedVersion !== 'string' || !expectedVersion.trim()) {
    throw new Error('Expected release version must be a nonempty string')
  }
  const resolvedDir = path.resolve(distDir)
  const metadataPath = path.join(resolvedDir, 'latest-mac.yml')
  const metadataStat = await requireFile(metadataPath)
  if (metadataStat.size > 1024 * 1024) throw new Error('latest-mac.yml exceeds the 1 MiB metadata limit')
  const metadata = parse(await fs.readFile(metadataPath, 'utf8'))
  if (!metadata || metadata.version !== expectedVersion) {
    throw new Error(`Update version mismatch: expected ${expectedVersion}, got ${metadata?.version}`)
  }
  if (!Array.isArray(metadata.files) || metadata.files.length === 0) {
    throw new Error('latest-mac.yml must contain archive entries in files')
  }

  const entries = new Map()
  const entryNames = new Set()
  for (const entry of metadata.files) {
    const name = archiveName(entry?.url)
    const slot = archiveSlot(name, expectedVersion)
    if (entries.has(slot) || entryNames.has(name)) throw new Error(`Duplicate archive entry: ${name}`)
    entries.set(slot, { name, entry })
    entryNames.add(name)
  }
  for (const arch of ARCHITECTURES) {
    if (!entries.has(`${arch}.zip`)) throw new Error(`Missing ${arch} ZIP entry in latest-mac.yml`)
  }

  const archives = new Map()
  for (const name of await fs.readdir(resolvedDir)) {
    if (!/\.(zip|dmg)$/i.test(name)) continue
    archiveName(name)
    const slot = archiveSlot(name, expectedVersion)
    if (archives.has(slot)) throw new Error(`Duplicate ${slot} archives in dist`)
    await requireFile(path.join(resolvedDir, name))
    archives.set(slot, name)
  }
  for (const arch of ARCHITECTURES) {
    for (const format of FORMATS) {
      if (!archives.has(`${arch}.${format}`)) throw new Error(`Missing ${arch} ${format.toUpperCase()} archive in dist`)
    }
  }
  for (const [slot, { name, entry }] of entries) {
    if (archives.get(slot) !== name) throw new Error(`Missing archive referenced by latest-mac.yml: ${name}`)
    await verifyChecksum(path.join(resolvedDir, name), entry)
  }

  // electron-builder also writes legacy fields. If present, they must identify
  // one of the verified ZIPs, not a DMG or a stale asset from another release.
  if (metadata.path !== undefined || metadata.sha512 !== undefined) {
    const legacyName = archiveName(metadata.path)
    const legacyEntry = [...entries.values()].find(({ name }) => name === legacyName && name.endsWith('.zip'))
    if (!legacyEntry || legacyEntry.entry.sha512 !== metadata.sha512) {
      throw new Error('Legacy path/sha512 do not match a verified ZIP entry in latest-mac.yml')
    }
  }

  return { version: expectedVersion, archives: [...archives.values()].sort() }
}

exports.verifyMacUpdate = verifyMacUpdate

if (require.main === module) {
  const [, , distDir = 'dist', expectedVersion] = process.argv
  verifyMacUpdate(distDir, expectedVersion)
    .then(({ version, archives }) => {
      console.log(`Verified macOS update ${version}: ${archives.join(', ')}`)
    })
    .catch((error) => {
      console.error(`macOS update validation failed: ${error.message}`)
      process.exitCode = 1
    })
}
