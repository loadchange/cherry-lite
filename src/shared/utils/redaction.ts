export const REDACTED = '<redacted>'

const SENSITIVE_KEY_STEMS = ['KEY', 'TOKEN', 'SECRET', 'AUTH', 'CREDENTIAL', 'PASS', 'COOKIE', 'SESSION']
const SENSITIVE_KEY_EXACT = ['openai-organization', 'openai-project']

export function isSensitiveKey(key: string): boolean {
  const upper = key.toUpperCase()
  return SENSITIVE_KEY_STEMS.some((stem) => upper.includes(stem)) || SENSITIVE_KEY_EXACT.includes(key.toLowerCase())
}

export function redactDeep(value: unknown): unknown {
  const ancestors = new WeakSet<object>()
  const redact = (current: unknown): unknown => {
    if (typeof current === 'string') {
      return current.length > 300 ? `${current.slice(0, 300)}…<${current.length - 300} more>` : current
    }
    if (current === null || typeof current !== 'object') return current
    if (ancestors.has(current)) return '[Circular]'
    ancestors.add(current)
    const result = Array.isArray(current)
      ? current.map(redact)
      : Object.fromEntries(
          Object.entries(current).map(([key, entry]) => [key, isSensitiveKey(key) ? REDACTED : redact(entry)])
        )
    ancestors.delete(current)
    return result
  }
  return redact(value)
}
