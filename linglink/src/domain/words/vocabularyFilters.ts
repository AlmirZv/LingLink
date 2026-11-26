import { foldSurface } from '@/constants/languages'
import { wordMatchesQuery } from '@/domain/words/characterReading'
import { resolveTranslationLabels } from '@/domain/words/resolveTranslation'
import type { ID, LanguageCode, Word } from '@/types/db'

export const WORD_MASTERY_TARGET = 5

export type WordListTab = 'all' | 'learning' | 'known' | 'unknown'

export interface UserWordEntry {
  word: Word
  level: number
  textsMastered: number
}

export interface UserWordGroup {
  id: ID
  word: Word
  members: UserWordEntry[]
  translations: { id: ID; label: string }[]
  mastery: number
  masteryTarget: number
}

export function masteryCount(entry: Pick<UserWordEntry, 'level' | 'textsMastered'>): number {
  return Math.min(WORD_MASTERY_TARGET, Math.max(entry.textsMastered, entry.level))
}

/** One practice step: the stored level becomes the current bar plus one, capped at full mastery. */
export function masteryLevelAfterPractice(level: number, textsMastered: number): number {
  return Math.min(WORD_MASTERY_TARGET, masteryCount({ level, textsMastered }) + 1)
}

export function masteryBucket(count: number, target = WORD_MASTERY_TARGET): Exclude<WordListTab, 'all'> {
  if (count >= target) return 'known'
  if (count <= 0) return 'unknown'
  return 'learning'
}

export function sameSurface(a: Pick<Word, 'language' | 'word'>, b: Pick<Word, 'language' | 'word'>): boolean {
  return a.language === b.language && foldSurface(a.word, a.language) === foldSurface(b.word, b.language)
}

/** Each translation is its own block of mastery, so two senses read 0/10. */
export function groupedMastery(
  members: UserWordEntry[],
  targetLanguage: LanguageCode,
): { mastery: number; masteryTarget: number } {
  let mastery = 0
  let masteryTarget = 0
  for (const member of members) {
    const senses = Math.max(1, member.word.translations[targetLanguage]?.length ?? 0)
    mastery += masteryCount(member) * senses
    masteryTarget += WORD_MASTERY_TARGET * senses
  }
  return { mastery, masteryTarget }
}

export function groupWordEntries(
  entries: UserWordEntry[],
  targetLanguage: LanguageCode,
  wordsById: Map<ID, Word>,
): UserWordGroup[] {
  const buckets = new Map<string, UserWordEntry[]>()
  const order: string[] = []
  for (const entry of entries) {
    const key = `${entry.word.language}:${foldSurface(entry.word.word, entry.word.language)}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(entry)
    else {
      buckets.set(key, [entry])
      order.push(key)
    }
  }

  return order.map((key) => {
    const members = buckets.get(key)!
    const word = members.find((member) => member.word.furigana)?.word ?? members[0]!.word
    const translations: { id: ID; label: string }[] = []
    for (const member of members) {
      for (const item of resolveTranslationLabels(member.word, targetLanguage, wordsById)) {
        if (!translations.some((existing) => existing.id === item.id)) translations.push(item)
      }
    }
    return {
      id: word.id,
      word,
      members,
      translations,
      ...groupedMastery(members, targetLanguage),
    }
  })
}

/** Fully mastered words stay in their relative order, after every other word. */
export function placeKnownGroupsLast(groups: UserWordGroup[]): UserWordGroup[] {
  const rest: UserWordGroup[] = []
  const known: UserWordGroup[] = []
  for (const group of groups) {
    if (group.masteryTarget > 0 && group.mastery >= group.masteryTarget) known.push(group)
    else rest.push(group)
  }
  return rest.concat(known)
}

export function filterWordGroups(
  groups: UserWordGroup[],
  tab: WordListTab,
  searchQuery: string,
): UserWordGroup[] {
  const q = searchQuery.trim().toLocaleLowerCase()
  return groups.filter((group) => {
    if (q && !group.members.some((member) => wordMatchesQuery(member.word, q))) return false
    if (tab === 'all') return true
    return masteryBucket(group.mastery, group.masteryTarget) === tab
  })
}

export function filterWordEntries(
  entries: UserWordEntry[],
  tab: WordListTab,
  searchQuery: string,
): UserWordEntry[] {
  const q = searchQuery.trim().toLocaleLowerCase()
  return entries.filter((entry) => {
    if (q && !wordMatchesQuery(entry.word, q)) return false
    if (tab === 'all') return true
    return masteryBucket(masteryCount(entry)) === tab
  })
}
