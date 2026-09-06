import { describe, expect, it } from 'vitest'

import { cleanSpeechText, detectSpeechLocale, escapeSpeechXml, splitSpeechText } from '../text'

describe('speech text', () => {
  it('keeps prose and link labels while omitting code, math, thinking and citation markers', () => {
    const input =
      '# Hello\n\n<think>private thoughts</think>**World** and [Cherry](https://example.org). [1]\n```js\nsecret()\n```\nInline `secret()` and $x^2$ and \\(a+b\\).\n![attachment](image.png)\n- Done'
    const result = cleanSpeechText(input)
    expect(result).toContain('Hello')
    expect(result).toContain('World and Cherry.')
    expect(result).toContain('Done')
    for (const hidden of ['private', 'secret', 'x^2', 'a+b', 'example.org', 'attachment', '[1]']) {
      expect(result).not.toContain(hidden)
    }
  })

  it('omits unfinished code and reasoning blocks', () => {
    expect(cleanSpeechText('Answer\n```ts\nnot prose')).toBe('Answer')
    expect(cleanSpeechText('Answer <analysis>unfinished thoughts')).toBe('Answer')
  })

  it('handles a long unfinished Markdown link without pathological backtracking', () => {
    const unfinished = `[label](https://example.org/${'a'.repeat(20_000)}`
    expect(cleanSpeechText(unfinished)).toBe(unfinished)
    expect(cleanSpeechText('[label](https://example.org/page_(detail))')).toBe('label')
  })

  it('decodes safe entities, preserves currency and strips invalid XML characters', () => {
    expect(cleanSpeechText('A &amp; B &lt; C &#x1F600; \u0000\uD800 $5 costs $10.')).toBe('A & B < C 😀 $5 costs $10.')
    expect(escapeSpeechXml('<voice name="x">&\'')).toBe('&lt;voice name=&quot;x&quot;&gt;&amp;&apos;')
  })

  it('never exceeds escaped SSML byte limits or splits a grapheme cluster', () => {
    const text = '你好。 A&B <C> 👨‍👩‍👧‍👦 café e\u0301 end. '.repeat(30)
    const parts = splitSpeechText(text, 60)
    expect(parts.length).toBeGreaterThan(10)
    for (const part of parts) {
      expect(Buffer.byteLength(escapeSpeechXml(part))).toBeLessThanOrEqual(60)
      expect(part).not.toContain('\uFFFD')
      expect(part).not.toMatch(/^\u200D|\u200D$/u)
    }
    expect(parts.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''))
  })

  it('rejects impossible budgets without looping or silently dropping text', () => {
    expect(() => splitSpeechText('😀', 3)).toThrow(RangeError)
    expect(() => splitSpeechText('a', 0)).toThrow(RangeError)
    expect(splitSpeechText('  ')).toEqual([])
  })

  it.each([
    ['你好 world', 'zh-CN'],
    ['こんにちは世界', 'ja-JP'],
    ['안녕하세요', 'ko-KR'],
    ['Hello', 'en-US'],
    ['Привет', 'ru-RU']
  ])('chooses a local default for %s', (text, locale) => expect(detectSpeechLocale(text)).toBe(locale))
})
