import { application } from '@application'
import type { StopCondition, ToolSet } from 'ai'

import { trackSteerYieldStopCondition } from '../../loop/toolLoopTermination'
import type { RequestFeature } from '../feature'

/**
 * Yield the running chat turn at the next safe step boundary when a steer message is queued for the
 * topic. The step cap and this condition are OR'd into `stopWhen`; when it fires the turn stops
 * cleanly (persisted as success) and `AiStreamManager` chains a continuation that answers the steer.
 */
export const steerYieldFeature: RequestFeature = {
  name: 'steer-yield',
  applies: (scope) => Boolean(scope.request.chatId),
  contributeStopConditions: (scope): StopCondition<ToolSet>[] => {
    const topicId = scope.request.chatId
    if (!topicId) return []
    return [trackSteerYieldStopCondition(() => application.get('AiStreamManager').hasPendingSteer(topicId))]
  }
}
