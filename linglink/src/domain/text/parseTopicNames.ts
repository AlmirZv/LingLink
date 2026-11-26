/** Split a free-text topic field into unique display names. Empty input yields none. */
export function parseTopicNames(raw: string): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const part of raw.split(/[,，、]/)) {
    const name = part.trim().replace(/\s+/g, ' ')
    if (!name) continue
    const key = name.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}
