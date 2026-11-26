import { normalizeWordStress } from '@/constants/languages'
import type { LanguageCode, Word } from '@/types/db'

/** Japanese and Chinese store a character spelling and a reading. */
const CHARACTER_SCRIPT_LANGUAGES = new Set<LanguageCode>(['ja', 'zh'])

export function usesCharacterScript(language: LanguageCode): boolean {
  return CHARACTER_SCRIPT_LANGUAGES.has(language)
}

/** Written form, ideographs, and reading — any of these can identify the word. */
export function wordMatchSurfaces(word: Pick<Word, 'word' | 'character' | 'furigana'>): string[] {
  return [word.word, word.character, word.furigana].filter((value): value is string => Boolean(value))
}

export function wordMatchesQuery(
  word: Pick<Word, 'word' | 'character' | 'furigana'>,
  query: string,
): boolean {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return false
  return wordMatchSurfaces(word).some((surface) => surface.toLocaleLowerCase().includes(needle))
}

/** Dialog titles and plain-text labels: 行く（いく）. */
export function formatWordLabel(word: Pick<Word, 'word' | 'furigana'>): string {
  const surface = normalizeWordStress(word.word)
  if (!word.furigana) return surface
  return `${surface}（${word.furigana}）`
}
