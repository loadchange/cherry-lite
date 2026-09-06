/** XML escaping is also the byte accounting used for SSML-backed providers. */
export function escapeSpeechXml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]!
  })
}

function decodeEntity(entity: string, value: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  if (named[value.toLowerCase()]) return named[value.toLowerCase()]
  if (!value.startsWith('#')) return entity
  const point =
    value[1]?.toLowerCase() === 'x' ? Number.parseInt(value.slice(2), 16) : Number.parseInt(value.slice(1), 10)
  return point >= 32 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : ''
}

/** Input is message prose; code, formulas, thinking blocks and attachment markup are intentionally silent. */
export function cleanSpeechText(text: string): string {
  return (
    text
      .replace(
        /<(think|thinking|analysis|reasoning|tool_call|tool_result|script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,
        ''
      )
      .replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^\s*\1[^\n]*(?:\n|$)|$(?![\s\S]))/gm, '')
      .replace(/`+[^`]*`+/g, '')
      .replace(/\$\$[\s\S]*?(?:\$\$|$)|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g, '')
      .replace(/\$(?!\s|\d+\b)([^$\n]+?)\$/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)|!\[[^\]]*\]\[[^\]]*\]/g, '')
      .replace(/\[([^\]\n]+)\]\((?:[^()\n]|\([^()\n]*\))*\)/g, '$1')
      .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
      .replace(/^\s*\[[^\]]+\]:[^\n]*(?:\n|$)/gm, '')
      .replace(/\[(?:\d+(?:\s*[,–-]\s*\d+)*|\^[^\]]+)\]|【\d+(?:†[^】]*)?】/g, '')
      .replace(/<https?:\/\/[^>]+>/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-+*]\s+|\d+[.)]\s+)(?:\[[ xX]\]\s*)?/gm, '')
      .replace(/^\s*(?:[-*_]\s*){3,}$|^\s*\|?[\s:|-]+\|?\s*$/gm, '')
      .replace(/\*{1,3}|_{1,3}|~~/g, '')
      .replace(/\s*\|\s*/g, '，')
      .replace(/\\([\\`*{}[\]()#+\-.!_>])/g, '$1')
      .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, decodeEntity)
      // XML 1.0 forbids these controls, including NUL, even inside escaped text.
      // oxlint-disable-next-line eslint/no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF\u200B\u202A-\u202E\u2066-\u2069]/g, '')
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/** The limit counts escaped UTF-8 bytes, excluding the provider's fixed SSML envelope. */
export function splitSpeechText(text: string, maxBytes = 3000): string[] {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('Invalid speech segment size')
  const result: string[] = []
  const pending: Array<{ text: string; bytes: number }> = []
  let bytes = 0
  const emit = (count: number) => {
    const part = pending.splice(0, count)
    const content = part
      .map((unit) => unit.text)
      .join('')
      .trim()
    if (content) result.push(content)
    bytes -= part.reduce((sum, unit) => sum + unit.bytes, 0)
  }
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
    const size = Buffer.byteLength(escapeSpeechXml(segment), 'utf8')
    if (size > maxBytes) throw new RangeError('Speech segment size is too small for a character')
    if (bytes + size > maxBytes) {
      let sentence = 0
      let word = 0
      pending.forEach((unit, index) => {
        if (/[。！？.!?;；\n]/u.test(unit.text)) sentence = index + 1
        if (/\s/u.test(unit.text)) word = index + 1
      })
      emit(sentence || word || pending.length)
      if (bytes + size > maxBytes) emit(pending.length)
    }
    pending.push({ text: segment, bytes: size })
    bytes += size
  }
  emit(pending.length)
  return result
}

/** A local script heuristic; callers with a known translation language should pass that language instead. */
export function detectSpeechLocale(text: string): string {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return 'ja-JP'
  if (/\p{Script=Hangul}/u.test(text)) return 'ko-KR'
  if (/\p{Script=Han}/u.test(text)) return 'zh-CN'
  if (/\p{Script=Cyrillic}/u.test(text)) return 'ru-RU'
  if (/\p{Script=Arabic}/u.test(text)) return 'ar-SA'
  if (/\p{Script=Devanagari}/u.test(text)) return 'hi-IN'
  if (/\p{Script=Thai}/u.test(text)) return 'th-TH'
  return 'en-US'
}
