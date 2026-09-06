/** Keep unrelated catalog rows stable when backporting selected source changes. */
export function mergeSelectedRows<T>(
  previous: T[],
  generated: T[],
  selected: Set<string>,
  keyOf: (row: T) => string
): T[] {
  return [
    ...previous.filter((row) => !selected.has(keyOf(row))),
    ...generated.filter((row) => selected.has(keyOf(row)))
  ]
}

type ReasoningRow = {
  providerId: string
  modelId: string
  apiModelId?: string
  reasoningContracts?: unknown
}

/** Refresh descriptor-derived reasoning on existing rows, preserving prices and serving IDs. */
export function refreshSnapshotReasoning<T extends ReasoningRow>(
  previous: T[],
  generated: T[],
  providerIds: Set<string>
): T[] {
  return previous.map((row) => {
    if (!providerIds.has(row.providerId)) return row
    const match =
      generated.find(
        (candidate) =>
          candidate.providerId === row.providerId &&
          candidate.modelId === row.modelId &&
          candidate.apiModelId === row.apiModelId
      ) ??
      (row.apiModelId
        ? undefined
        : generated.find((candidate) => candidate.providerId === row.providerId && candidate.modelId === row.modelId))
    return match?.reasoningContracts ? { ...row, reasoningContracts: match.reasoningContracts } : row
  })
}
