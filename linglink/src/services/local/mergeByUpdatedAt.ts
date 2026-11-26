function stamp(value: { updatedAt?: unknown; learnedAt?: unknown }): string {
  return String(value.updatedAt ?? value.learnedAt ?? '')
}

export function pickNewer<T extends { updatedAt?: unknown; learnedAt?: unknown }>(local: T, remote: T): T {
  return stamp(remote).localeCompare(stamp(local)) > 0 ? remote : local
}

export function mergeById<T>(
  locals: T[],
  remotes: T[],
  idOf: (item: T) => string,
  pick: (local: T, remote: T) => T,
): T[] {
  const map = new Map<string, T>()
  for (const item of locals) map.set(idOf(item), item)
  for (const item of remotes) {
    const id = idOf(item)
    const current = map.get(id)
    map.set(id, current ? pick(current, item) : item)
  }
  return [...map.values()]
}
