import { foldSurface } from '@/constants/languages'
import { mergeAppearances } from '@/domain/words/textAppearances'
import type {
  GrammarConstruction,
  ID,
  LanguageCode,
  LearningText,
  UserTextProgress,
  UserWordProgress,
  UserWordTextHistory,
  Word,
} from '@/types/db'

export function wordSurfaceKey(word: Pick<Word, 'language' | 'word'>): string {
  return `${word.language}:${foldSurface(word.word, word.language)}`
}

export function remapWordId(id: ID, remap: Map<ID, ID>): ID {
  return remap.get(id) ?? id
}

function uniqueIds(ids: ID[]): ID[] {
  const out: ID[] = []
  for (const id of ids) {
    if (!out.includes(id)) out.push(id)
  }
  return out
}

function createdStamp(word: Word): string {
  return typeof word.createdAt === 'string' ? word.createdAt : ''
}

function pickKeeper(group: Word[], preferId?: ID): Word {
  if (preferId) {
    const preferred = group.find((word) => word.id === preferId)
    if (preferred) return preferred
  }
  return [...group].sort((a, b) => {
    const byDate = createdStamp(a).localeCompare(createdStamp(b))
    if (byDate !== 0) return byDate
    const aSpecific = a.type === 'other' ? 1 : 0
    const bSpecific = b.type === 'other' ? 1 : 0
    if (aSpecific !== bSpecific) return aSpecific - bSpecific
    return a.id.localeCompare(b.id)
  })[0]!
}

function dictionaryStatus(group: Word[]): Word['multilingualDictionary'] {
  if (group.some((word) => word.multilingualDictionary === 'found')) return 'found'
  if (group.some((word) => word.multilingualDictionary === 'missing')) return 'missing'
  return undefined
}

/** Collapse words that share a language and written form. Translation ids are unioned onto the oldest card. */
export function mergeDuplicateWords(
  words: Word[],
  options?: { preferId?: ID },
): { words: Word[]; remap: Map<ID, ID> } {
  const groups = new Map<string, Word[]>()
  const order: string[] = []
  for (const word of words) {
    const key = wordSurfaceKey(word)
    const bucket = groups.get(key)
    if (bucket) bucket.push(word)
    else {
      groups.set(key, [word])
      order.push(key)
    }
  }

  const remap = new Map<ID, ID>()
  const keepers = new Map<string, Word>()
  for (const key of order) {
    const group = groups.get(key)!
    const keeper = pickKeeper(group, options?.preferId)
    keepers.set(key, keeper)
    for (const word of group) {
      if (word.id !== keeper.id) remap.set(word.id, keeper.id)
    }
  }

  const merged: Word[] = []
  for (const key of order) {
    const group = groups.get(key)!
    const keeper = keepers.get(key)!
    if (group.length === 1 && !linksNeedRemap(keeper, remap)) {
      merged.push(keeper)
      continue
    }
    const translations: Record<LanguageCode, ID[]> = {}
    for (const word of group) {
      for (const [language, ids] of Object.entries(word.translations)) {
        const list = translations[language] ? [...translations[language]] : []
        for (const id of ids) {
          const next = remap.get(id) ?? id
          if (next !== keeper.id && !list.includes(next)) list.push(next)
        }
        if (list.length) translations[language] = list
      }
    }
    const type = group.find((word) => word.type !== 'other')?.type ?? keeper.type
    const character = group.find((word) => word.character)?.character
    const furigana = group.find((word) => word.furigana)?.furigana
    const status = dictionaryStatus(group)
    const next: Word = {
      ...keeper,
      type,
      translations,
      rootWords: uniqueIds(
        group.flatMap((word) => word.rootWords).map((id) => remap.get(id) ?? id),
      ).filter((id) => id !== keeper.id),
      grammarConstructions: uniqueIds(group.flatMap((word) => word.grammarConstructions)),
      textAppearances: mergeAppearances(group.flatMap((word) => word.textAppearances ?? [])),
      updatedAt: new Date().toISOString(),
    }
    if (character) next.character = character
    else delete next.character
    if (furigana) next.furigana = furigana
    else delete next.furigana
    if (status) next.multilingualDictionary = status
    merged.push(next)
  }

  return { words: merged, remap }
}

function linksNeedRemap(word: Word, remap: Map<ID, ID>): boolean {
  if (remap.size === 0) return false
  const ids = [...word.rootWords, ...Object.values(word.translations).flat()]
  return ids.some((id) => remap.has(id))
}

/** Fold a new card into the one already stored for the same written form. */
export function absorbWord(stored: Word, incoming: Word): Word {
  const { words } = mergeDuplicateWords([stored, incoming], { preferId: stored.id })
  return words.find((word) => word.id === stored.id) ?? stored
}

export function remapLearningText(text: LearningText, remap: Map<ID, ID>): LearningText {
  if (remap.size === 0) return text
  return {
    ...text,
    wordIds: uniqueIds(text.wordIds.map((id) => remapWordId(id, remap))),
    sentences: text.sentences.map((sentence) => ({
      ...sentence,
      words: sentence.words.map((occurrence) => ({
        ...occurrence,
        wordId: occurrence.wordId ? remapWordId(occurrence.wordId, remap) : occurrence.wordId,
        translations: occurrence.translations.map((proposal) => ({
          ...proposal,
          translationWordId: remapWordId(proposal.translationWordId, remap),
        })),
      })),
    })),
    finalTranslations: Object.fromEntries(
      Object.entries(text.finalTranslations).map(([language, final]) => [
        language,
        {
          ...final,
          words: final.words.map((piece) => ({
            ...piece,
            wordId: piece.wordId ? remapWordId(piece.wordId, remap) : piece.wordId,
          })),
        },
      ]),
    ),
  }
}

export function remapConstruction(
  construction: GrammarConstruction,
  remap: Map<ID, ID>,
): GrammarConstruction {
  if (remap.size === 0) return construction
  const translations: Record<LanguageCode, ID[]> = {}
  for (const [language, ids] of Object.entries(construction.translations)) {
    translations[language] = uniqueIds(ids.map((id) => remapWordId(id, remap)))
  }
  return {
    ...construction,
    translations,
    relatedWords: uniqueIds(construction.relatedWords.map((id) => remapWordId(id, remap))),
    ...(construction.wordIds
      ? { wordIds: uniqueIds(construction.wordIds.map((id) => remapWordId(id, remap))) }
      : {}),
  }
}

export function remapWordProgress(rows: UserWordProgress[], remap: Map<ID, ID>): UserWordProgress[] {
  if (remap.size === 0) return rows
  const byKey = new Map<string, UserWordProgress>()
  for (const row of rows) {
    const wordId = remapWordId(row.wordId, remap)
    const key = `${row.userId}:${wordId}`
    const previous = byKey.get(key)
    if (!previous || row.level > previous.level) byKey.set(key, { ...row, wordId })
  }
  return [...byKey.values()]
}

export function remapTextProgress(rows: UserTextProgress[], remap: Map<ID, ID>): UserTextProgress[] {
  if (remap.size === 0) return rows
  return rows.map((row) => ({
    ...row,
    learnedWordIds: uniqueIds(row.learnedWordIds.map((id) => remapWordId(id, remap))),
  }))
}

export function remapWordHistory(
  rows: UserWordTextHistory[],
  remap: Map<ID, ID>,
): UserWordTextHistory[] {
  if (remap.size === 0) return rows
  const byKey = new Map<string, UserWordTextHistory>()
  for (const row of rows) {
    const wordId = remapWordId(row.wordId, remap)
    byKey.set(`${row.userId}:${wordId}:${row.textId}`, { ...row, wordId })
  }
  return [...byKey.values()]
}
