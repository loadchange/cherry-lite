import { describe, expect, it, vi } from 'vitest'

const hasPendingSteer = vi.fn()
vi.mock('@application', () => ({
  application: { get: vi.fn(() => ({ hasPendingSteer })) }
}))

import { steerYieldFeature } from '../steerYield'

const scope = (chatId?: string) => ({ request: { chatId } }) as any

describe('steerYieldFeature', () => {
  it('applies to chat topics, not topicless requests', () => {
    expect(steerYieldFeature.applies?.(scope('topic-1'))).toBe(true)
    expect(steerYieldFeature.applies?.(scope(undefined))).toBe(false)
  })

  it('contributes a stop condition that fires only when the topic has a pending steer', async () => {
    const [condition] = steerYieldFeature.contributeStopConditions!(scope('topic-1'))

    hasPendingSteer.mockReturnValue(false)
    expect(await condition({ steps: [] } as any)).toBe(false)

    hasPendingSteer.mockReturnValue(true)
    expect(await condition({ steps: [] } as any)).toBe(true)
    expect(hasPendingSteer).toHaveBeenCalledWith('topic-1')
  })

  it('contributes nothing for a topicless request', () => {
    expect(steerYieldFeature.contributeStopConditions!(scope(undefined))).toEqual([])
  })
})
