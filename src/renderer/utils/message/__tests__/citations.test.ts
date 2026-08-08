import type { CherryMessagePart } from '@shared/data/types/message'
import { describe, expect, it } from 'vitest'

import {
  resolveCitationMarkerParts,
  resolveMessageCitations,
  stripCitationMarkers,
  toExportableCitations,
  withToolCitationTags
} from '../citations'

const webResults = (prefix: string) => [
  { id: `${prefix}-1`, title: 'First', url: 'https://a.com/x', content: 'alpha *bold*' },
  { id: `${prefix}-2`, title: 'Second', url: 'https://b.com/y', content: 'beta' }
]

const webToolPart = (results: unknown, state = 'output-available'): CherryMessagePart =>
  ({ type: 'tool-web_search', toolCallId: 'c1', state, input: { query: 'q' }, output: results }) as never

/** A second citable call in the same message — `web_fetch` is the other builtin lookup tool. */
const webFetchPart = (results: unknown): CherryMessagePart =>
  ({
    type: 'tool-web_fetch',
    toolCallId: 'c2',
    state: 'output-available',
    input: { urls: ['https://c.com/z'] },
    output: results
  }) as never

const dynamicMcpPart = (toolName: string, content: unknown, serverName = 'cherry-tools'): CherryMessagePart =>
  ({
    type: 'dynamic-tool',
    toolName,
    toolCallId: 'c3',
    state: 'output-available',
    input: { query: 'q' },
    output: { content, metadata: { type: 'mcp', serverName } }
  }) as never

const toolInvokePart = (name: string, output: unknown): CherryMessagePart =>
  ({
    type: 'tool-tool_invoke',
    toolCallId: 'c4',
    state: 'output-available',
    input: { name, params: { query: 'q' } },
    output
  }) as never

const sourceUrlPart = (n: number, url: string, title?: string): CherryMessagePart =>
  ({ type: 'source-url', sourceId: `citation-${n}`, url, title }) as never

const textPart = (text: string): CherryMessagePart => ({ type: 'text', text }) as never

describe('resolveMessageCitations', () => {
  it('resolves static assistant tool parts with sequential display numbers', () => {
    const mc = resolveMessageCitations([
      webToolPart(webResults('abc')),
      webFetchPart([{ id: 'kzz-1', title: 'Third', url: 'https://c.com/z', content: 'gamma' }])
    ])
    expect(mc.all.map((c) => c.number)).toEqual([1, 2, 3])
    expect(mc.byId.get('abc-1')).toMatchObject({ number: 1, url: 'https://a.com/x', type: 'websearch' })
    expect(mc.byId.get('kzz-1')).toMatchObject({ number: 3, title: 'Third', url: 'https://c.com/z' })
  })

  it('resolves agent dynamic-tool parts with MCP-wrapped output', () => {
    const mc = resolveMessageCitations([dynamicMcpPart('mcp__cherry-tools__web_fetch', webResults('qqq'))])
    expect(mc.byId.get('qqq-1')).toMatchObject({ type: 'websearch', content: 'alpha *bold*' })
  })

  it('ignores third-party MCP tools sharing the builtin name', () => {
    const mc = resolveMessageCitations([dynamicMcpPart('mcp__other-server__web_search', webResults('abc'))])
    expect(mc.all).toHaveLength(0)
  })

  it('requires cherry-tools metadata for raw same-named dynamic tools', () => {
    const thirdParty = resolveMessageCitations([dynamicMcpPart('web_search', webResults('abc'), 'other-server')])
    const cherry = resolveMessageCitations([dynamicMcpPart('web_search', webResults('abc'))])

    expect(thirdParty.all).toHaveLength(0)
    expect(cherry.all).toHaveLength(2)
  })

  it('resolves deferred tool_invoke parts by inner tool name', () => {
    const mc = resolveMessageCitations([toolInvokePart('web_search', webResults('t9k'))])
    expect(mc.byId.get('t9k-2')).toMatchObject({ number: 2, url: 'https://b.com/y' })
  })

  it('resolves citations from the skeleton of a bare entities envelope (cold load)', () => {
    const mc = resolveMessageCitations([
      webToolPart({
        $persistedToolOutput: {
          shape: 'entities',
          skeleton: webResults('env'),
          blobRefs: [
            {
              key: '/0/content',
              fileEntryId: 'entry-1',
              vfsFilename: 'vfs_1.txt',
              head: 'h',
              tail: 't',
              totalChars: 100_000,
              totalLines: 2_000
            }
          ]
        }
      })
    ])
    expect(mc.byId.get('env-1')).toMatchObject({ number: 1, url: 'https://a.com/x', type: 'websearch' })
    expect(mc.byId.get('env-2')).toMatchObject({ number: 2, url: 'https://b.com/y' })
  })

  it('resolves citations from the skeleton riding a deferred reference (transport)', () => {
    const mc = resolveMessageCitations([
      webToolPart({
        $deferredToolResult: { topicId: 'topic-1', messageId: 'm1', toolCallId: 'c1' },
        excerpt: { head: 'h', tail: 't', totalChars: 100_000, totalLines: 2_000 },
        skeleton: webResults('dfr')
      })
    ])
    expect(mc.byId.get('dfr-1')).toMatchObject({ number: 1, url: 'https://a.com/x' })
  })

  it('yields nothing for a deferred reference without a skeleton (unchanged behavior)', () => {
    const mc = resolveMessageCitations([
      webToolPart({ $deferredToolResult: { topicId: 'topic-1', messageId: 'm1', toolCallId: 'c1' } })
    ])
    expect(mc.all).toHaveLength(0)
  })

  it('collects provider-native source-url parts keyed by their marker numbers', () => {
    const mc = resolveMessageCitations([sourceUrlPart(0, 'https://s.com/1', 'S1'), sourceUrlPart(1, 'https://s.com/2')])
    expect(mc.byMarkerNumber.get(1)).toMatchObject({ url: 'https://s.com/1', title: 'S1' })
    expect(mc.byMarkerNumber.get(2)).toMatchObject({ url: 'https://s.com/2', title: 's.com' })
  })

  it('skips error outputs and string MCP notes', () => {
    const mc = resolveMessageCitations([
      webToolPart({ error: 'provider down', retryable: true }),
      dynamicMcpPart('mcp__cherry-tools__web_search', 'No matches; refine the query.')
    ])
    expect(mc.all).toHaveLength(0)
  })

  it('parses legacy numeric ids and exposes bare-marker resolution for a single call', () => {
    const mc = resolveMessageCitations([
      webToolPart([{ id: 2, title: 'Old', url: 'https://old.com', content: 'legacy' }])
    ])
    expect(mc.byId.get('2')).toMatchObject({ url: 'https://old.com' })
    expect(mc.byMarkerNumber.get(2)).toBeDefined()
  })

  it('withholds bare-marker resolution when multiple calls make numbers ambiguous', () => {
    const mc = resolveMessageCitations([
      webToolPart(webResults('aaa')),
      webFetchPart([{ id: 'bbb-1', title: 'Third', url: 'https://c.com/z', content: 'gamma' }])
    ])
    expect(mc.byMarkerNumber.size).toBe(0)
    expect(mc.byId.size).toBe(3)
  })

  it('aliases duplicate URLs across calls to one citation', () => {
    const first = webToolPart(webResults('aaa'))
    const second = {
      ...webToolPart([{ id: 'zzz-1', title: 'Dup', url: 'https://a.com/x', content: 'dup' }]),
      toolCallId: 'c9'
    } as CherryMessagePart
    const mc = resolveMessageCitations([first, second])
    expect(mc.all).toHaveLength(2)
    expect(mc.byId.get('zzz-1')).toBe(mc.byId.get('aaa-1'))
  })

  it('drops a later result whose id collides with an earlier one', () => {
    // Citation ids carry 32 bits of per-call entropy so this effectively cannot happen;
    // pin the resolution anyway so a collision degrades predictably (first id wins)
    // rather than silently re-pointing an already-rendered badge.
    const mc = resolveMessageCitations([
      webToolPart([{ id: 'dup-1', title: 'First', url: 'https://a.com/x', content: 'alpha' }]),
      webToolPart([{ id: 'dup-1', title: 'Second', url: 'https://b.com/y', content: 'beta' }])
    ])
    expect(mc.all).toHaveLength(1)
    expect(mc.byId.get('dup-1')?.url).toBe('https://a.com/x')
  })

  it('ignores tool parts that have not completed', () => {
    const mc = resolveMessageCitations([webToolPart(undefined, 'input-available'), textPart('hi')])
    expect(mc.all).toHaveLength(0)
  })
})

describe('withToolCitationTags', () => {
  it('maps [cite:id] markers to sup tags and reports the cited subset in order', () => {
    const mc = resolveMessageCitations([
      webToolPart(webResults('abc')),
      webFetchPart([{ id: 'kzz-1', title: 'Unlinked', url: '', content: 'gamma' }])
    ])
    const { content, cited } = withToolCitationTags(
      'B fact. [cite:abc-2] Unlinked fact. [cite:kzz-1] Again [cite:abc-2]',
      mc
    )
    // Numbered by first appearance, not by position in the result set: abc-2 resolves to the
    // resolver's #2 and kzz-1 to its #3, but they render as 1 and 2.
    expect(content).toContain('1</sup>](https://b.com/y)')
    // Citations with a URL link out; a URL-less one must stay a bare <sup> so rehype-harden
    // does not rewrite an empty-href anchor into "<span>… [blocked]</span>".
    expect(content).toContain('2</sup>')
    expect(content).not.toContain('2</sup>]()')
    expect(cited.map((c) => c.number)).toEqual([1, 2])
    // A repeat of the same source reuses its number instead of taking a new one.
    expect(content.match(/>1<\/sup>/g)).toHaveLength(2)
  })

  it('numbers badges in reading order even when the model cites out of order', () => {
    const mc = resolveMessageCitations([webToolPart(webResults('abc'))])
    // abc-2 is the resolver's #2 and abc-1 its #1, but the text cites the later result first.
    const { content, cited } = withToolCitationTags('First [cite:abc-2] then [cite:abc-1]', mc)

    expect(content.indexOf('>1</sup>')).toBeLessThan(content.indexOf('>2</sup>'))
    // The footer list follows the same order, so badge N is the Nth entry in the panel.
    expect(cited.map((c) => c.number)).toEqual([1, 2])
    expect(cited.map((c) => c.url)).toEqual(['https://b.com/y', 'https://a.com/x'])
  })

  it('collapses adjacent markers that resolve to the same source', () => {
    // Two results for one URL dedupe to a single citation, so the chained markers the model
    // wrote would otherwise render as the same badge twice.
    const mc = resolveMessageCitations([
      webToolPart([
        { id: 'sss-1', title: 'One', url: 'https://a.com/x', content: 'first' },
        { id: 'sss-2', title: 'One', url: 'https://a.com/x', content: 'second' }
      ])
    ])
    const { content, cited } = withToolCitationTags('Shared fact. [cite:sss-1][cite:sss-2]', mc)

    expect(content.match(/>1<\/sup>/g)).toHaveLength(1)
    expect(cited).toHaveLength(1)
  })

  it('keeps distinct sources in a chained run', () => {
    const mc = resolveMessageCitations([webToolPart(webResults('abc'))])
    const { content } = withToolCitationTags('Fact. [cite:abc-1] [cite:abc-2]', mc)

    expect(content).toContain('1</sup>](https://a.com/x)')
    expect(content).toContain('2</sup>](https://b.com/y)')
  })

  it('leaves unknown ids literal', () => {
    const mc = resolveMessageCitations([webToolPart(webResults('abc'))])
    const { content, cited } = withToolCitationTags('Fact. [cite:zzz-9]', mc)
    expect(content).toContain('[cite:zzz-9]')
    expect(cited).toHaveLength(0)
  })

  it('promotes bare [N] markers for a single lookup call', () => {
    const mc = resolveMessageCitations([webToolPart([{ id: 1, title: 'Old', url: 'https://old.com', content: 'x' }])])
    const { content, cited } = withToolCitationTags('Old fact. [1]', mc)
    expect(content).toContain('1</sup>](https://old.com)')
    expect(cited).toHaveLength(1)
  })

  it('does not promote bare [N] inside code blocks', () => {
    const mc = resolveMessageCitations([webToolPart([{ id: 1, title: 'Old', url: 'https://old.com', content: 'x' }])])
    const { content } = withToolCitationTags('`arr[1]` and text [1]', mc)
    expect(content).toContain('`arr[1]`')
    expect(content).toContain('1</sup>](https://old.com)')
  })

  it('resolves provider-native [N] markers from source-url parts', () => {
    const mc = resolveMessageCitations([sourceUrlPart(0, 'https://s.com/1', 'S1')])
    const { content, cited } = withToolCitationTags('Grounded fact. [1]', mc)
    expect(content).toContain('1</sup>](https://s.com/1)')
    expect(cited.map((c) => c.title)).toEqual(['S1'])
  })

  it('cleans markdown in tooltip snippets', () => {
    const mc = resolveMessageCitations([webToolPart(webResults('abc'))])
    const { content, cited } = withToolCitationTags('Fact. [cite:abc-1]', mc)
    expect(content).not.toContain('alpha')
    expect(cited[0].content).toBe('alpha bold')
  })

  it('preserves canonical markers in inline and fenced code', () => {
    const mc = resolveMessageCitations([webToolPart(webResults('abc'))])
    const input = 'Use `[cite:abc-1]`.\n```md\n[cite:abc-2]\n```\nOutside [cite:abc-1]'
    const { content, cited } = withToolCitationTags(input, mc)

    expect(content).toContain('`[cite:abc-1]`')
    expect(content).toContain('```md\n[cite:abc-2]\n```')
    expect(content).toContain("data-citation='1'")
    expect(cited).toHaveLength(1)
  })
})

describe('resolveCitationMarkerParts', () => {
  it('shares display numbering across text parts in reading order', () => {
    const citations = resolveMessageCitations([webToolPart(webResults('abc'))])
    const [first, second] = resolveCitationMarkerParts(
      ['First [cite:abc-2]', 'Second [cite:abc-1] and [cite:abc-2]'],
      citations
    )

    expect(first.byMarker.get('abc-2')?.number).toBe(1)
    expect(second.byMarker.get('abc-1')?.number).toBe(2)
    expect(second.byMarker.get('abc-2')?.number).toBe(1)
    expect(first.cited.map((citation) => citation.number)).toEqual([1])
    expect(second.cited.map((citation) => citation.number)).toEqual([2, 1])
  })
})

describe('toExportableCitations', () => {
  it('rewrites markers to plain [N] and reports the cited sources', () => {
    const parts = [webToolPart(webResults('abc'))]
    const { content, cited } = toExportableCitations('First [cite:abc-1] then [cite:abc-2].', parts)

    expect(content).toBe('First [1] then [2].')
    expect(cited.map((c) => c.url)).toEqual(['https://a.com/x', 'https://b.com/y'])
  })

  it('numbers by first appearance, matching the rendered badges', () => {
    const parts = [webToolPart(webResults('abc'))]
    const { content, cited } = toExportableCitations('Later first [cite:abc-2] then [cite:abc-1].', parts)

    expect(content).toBe('Later first [1] then [2].')
    expect(cited.map((c) => c.url)).toEqual(['https://b.com/y', 'https://a.com/x'])
  })

  it('drops a marker whose id resolves to nothing', () => {
    // An internal id must never reach an exported document or the clipboard.
    const { content, cited } = toExportableCitations('Claim [cite:gone-9].', [webToolPart(webResults('abc'))])

    // The separating space goes with the marker, so the sentence does not end up as 'Claim .'
    expect(content).toBe('Claim.')
    expect(cited).toEqual([])
  })

  it('strips markers even when the message carries no tool results', () => {
    const { content } = toExportableCitations('Claim [cite:abc-1].', [textPart('hi')])
    expect(content).toBe('Claim.')
  })

  it('collapses repeat markers the way the rendered badges do', () => {
    const parts = [
      webToolPart([
        { id: 'sss-1', title: 'One', url: 'https://a.com/x', content: 'first' },
        { id: 'sss-2', title: 'One', url: 'https://a.com/x', content: 'second' }
      ])
    ]
    const { content, cited } = toExportableCitations('Shared fact. [cite:sss-1][cite:sss-2]', parts)

    expect(content).toBe('Shared fact. [1]')
    expect(cited).toHaveLength(1)
  })

  it('leaves a message without markers untouched', () => {
    const { content, cited } = toExportableCitations('Plain answer.', [webToolPart(webResults('abc'))])
    expect(content).toBe('Plain answer.')
    expect(cited).toEqual([])
  })

  it('preserves canonical markers in code while rewriting prose markers', () => {
    const parts = [webToolPart(webResults('abc'))]
    const input = '`[cite:abc-1]`\n```txt\n[cite:abc-2]\n```\nOutside [cite:abc-1]'
    const { content, cited } = toExportableCitations(input, parts)

    expect(content).toBe('`[cite:abc-1]`\n```txt\n[cite:abc-2]\n```\nOutside [1]')
    expect(cited).toHaveLength(1)
  })
})

describe('stripCitationMarkers', () => {
  // Used for text outside the numbered answer — reasoning traces above all — where resolving
  // would either restart at [1] or emit numbers that contradict the answer body.
  it('removes every marker along with its separating space', () => {
    expect(stripCitationMarkers('Prices rose. [cite:abc-1] Demand fell. [cite:abc-2]')).toBe(
      'Prices rose. Demand fell.'
    )
  })

  it('removes chained markers without leaving a gap', () => {
    expect(stripCitationMarkers('Both agree. [cite:abc-1][cite:def-3]')).toBe('Both agree.')
  })

  it('leaves text without markers untouched, including plain bracket numbers', () => {
    expect(stripCitationMarkers('Plain reasoning about [1] and [brackets].')).toBe(
      'Plain reasoning about [1] and [brackets].'
    )
  })

  it('preserves canonical markers in inline and fenced code', () => {
    const input = '`[cite:abc-1]`\n```txt\n[cite:def-2]\n```\nOutside [cite:abc-1]'
    expect(stripCitationMarkers(input)).toBe('`[cite:abc-1]`\n```txt\n[cite:def-2]\n```\nOutside')
  })
})
