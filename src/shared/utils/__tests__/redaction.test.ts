import { describe, expect, it } from 'vitest'

import { redactDeep } from '../redaction'

describe('redactDeep', () => {
  it('redacts nested credentials without changing the request', () => {
    const request = { provider: { apiKeys: [{ key: 'secret' }] }, headers: { Authorization: 'Bearer secret' } }
    expect(redactDeep(request)).toEqual({
      provider: { apiKeys: '<redacted>' },
      headers: { Authorization: '<redacted>' }
    })
    expect(request.provider.apiKeys[0].key).toBe('secret')
  })

  it('redacts shared references at every occurrence', () => {
    const shared = { password: 'secret', name: 'retained' }
    expect(redactDeep([shared, shared])).toEqual([
      { password: '<redacted>', name: 'retained' },
      { password: '<redacted>', name: 'retained' }
    ])
  })

  it('bounds circular references and long strings', () => {
    const circular: Record<string, unknown> = { text: 'x'.repeat(301) }
    circular.child = circular
    expect(redactDeep(circular)).toEqual({ text: `${'x'.repeat(300)}…<1 more>`, child: '[Circular]' })
  })
})
