import type { ID, LearningText, Word, WordTextAppearance } from '@/types/db'

/** Published texts can be opened. Hidden and deleted texts stay on the word, but are not readable. */
export function textIsReadable(status: LearningText['status']): boolean {
  return status === 'published'
}

/** Translation words selected in a published text. One text counts once. */
export function selectedTranslationWordIds(text: LearningText): Set<ID> {
  const ids = new Set<ID>()
  if (text.status !== 'published') return ids
  for (const sentence of text.sentences) {
    for (const occurrence of sentence.words) {
      const proposal = occurrence.translations.find((item) => item.id === occurrence.selectedTranslationId)
      if (proposal?.translationWordId) ids.add(proposal.translationWordId)
    }
  }
  return ids
}

export function textSelectsTranslation(text: LearningText, translationWordId: ID): boolean {
  return selectedTranslationWordIds(text).has(translationWordId)
}

/** Count every occurrence that is linked to a word. The same word in two places counts as 2. */
export function countWordOccurrences(text: LearningText): Map<ID, number> {
  const counts = new Map<ID, number>()
  for (const sentence of text.sentences) {
    for (const occurrence of sentence.words) {
      if (!occurrence.wordId) continue
      counts.set(occurrence.wordId, (counts.get(occurrence.wordId) ?? 0) + 1)
    }
  }
  return counts
}

/** Keep the text's word id list equal to the words that actually occur in its sentences. */
export function withOccurrenceWordIds(text: LearningText): LearningText {
  return { ...text, wordIds: [...countWordOccurrences(text).keys()] }
}

export function sameAppearances(
  left: WordTextAppearance[] | undefined,
  right: WordTextAppearance[] | undefined,
): boolean {
  const a = normalizeAppearances(left)
  const b = normalizeAppearances(right)
  return a.length === b.length && a.every((item, index) => {
    const other = b[index]
    return other !== undefined && item.textId === other.textId && item.count === other.count && item.readable === other.readable
  })
}

export function normalizeAppearances(items: WordTextAppearance[] | undefined): WordTextAppearance[] {
  return [...(items ?? [])].sort((a, b) => a.textId.localeCompare(b.textId))
}

export function upsertAppearance(word: Word, appearance: WordTextAppearance): Word {
  const list = [...(word.textAppearances ?? [])]
  const index = list.findIndex((item) => item.textId === appearance.textId)
  if (index === -1) list.push(appearance)
  else list[index] = appearance
  return { ...word, textAppearances: normalizeAppearances(list) }
}

export function removeAppearance(word: Word, textId: ID): Word {
  return {
    ...word,
    textAppearances: (word.textAppearances ?? []).filter((item) => item.textId !== textId),
  }
}

export function setAppearanceReadable(word: Word, textId: ID, readable: boolean): Word {
  const list = word.textAppearances ?? []
  if (!list.some((item) => item.textId === textId && item.readable !== readable)) return word
  return {
    ...word,
    textAppearances: list.map((item) => (item.textId === textId ? { ...item, readable } : item)),
  }
}

export function mergeAppearances(items: WordTextAppearance[]): WordTextAppearance[] {
  const byText = new Map<ID, WordTextAppearance>()
  for (const item of items) {
    const previous = byText.get(item.textId)
    if (!previous) {
      byText.set(item.textId, { ...item })
      continue
    }
    byText.set(item.textId, {
      textId: item.textId,
      count: previous.count + item.count,
      readable: previous.readable || item.readable,
    })
  }
  return normalizeAppearances([...byText.values()])
}

/** Rebuild every word's text list from the texts currently stored. Drafts are skipped. */
export function indexTextsOntoWords(words: Word[], texts: LearningText[]): Word[] {
  const appearances = new Map<ID, WordTextAppearance[]>()
  for (const text of texts) {
    if (text.status === 'draft') continue
    const readable = textIsReadable(text.status)
    for (const [wordId, count] of countWordOccurrences(text)) {
      const list = appearances.get(wordId) ?? []
      list.push({ textId: text.id, count, readable })
      appearances.set(wordId, list)
    }
  }

  return words.map((word) => {
    const next = normalizeAppearances(appearances.get(word.id) ?? [])
    if (sameAppearances(word.textAppearances, next)) return word
    if (next.length === 0 && word.textAppearances === undefined) return word
    return { ...word, textAppearances: next }
  })
}

export function readableTextIds(words: Pick<Word, 'textAppearances'>[]): ID[] {
  const ids: ID[] = []
  for (const word of words) {
    for (const appearance of word.textAppearances ?? []) {
      if (!appearance.readable || ids.includes(appearance.textId)) continue
      ids.push(appearance.textId)
    }
  }
  return ids
}
