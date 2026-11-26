import type { AnalyzedWord, AnalysisWordLookup } from '@/types/analysis'
import type { ID } from '@/types/db'

export async function attachRootWordsInText(
  words: AnalyzedWord[],
  foundWordIds: Set<ID>,
  lookup: AnalysisWordLookup,
): Promise<number> {
  const checkedRootWords = new Set<ID>()
  let groupCount = 0

  for (const analyzed of words) {
    if (!analyzed.wordId) continue
    const entity = await lookup.getWordById(analyzed.wordId)
    if (!entity) continue

    for (const rootId of entity.rootWords) {
      if (checkedRootWords.has(rootId)) continue
      checkedRootWords.add(rootId)
      if (foundWordIds.has(rootId)) {
        groupCount += 1
        analyzed.rootWordsInText.push(rootId)
      }
    }
  }

  return groupCount
}
