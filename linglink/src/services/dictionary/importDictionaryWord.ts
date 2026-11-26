import { foldSurface, normalizeWordStress } from '@/constants/languages'
import { wordMatchSurfaces } from '@/domain/words/characterReading'
import type { Repositories } from '@/services/repositories/contracts'
import type { WordCatalog } from '@/services/wordCatalog'
import type { ID, LanguageCode, Word } from '@/types/db'

import { formsFromDictionaryEntry, ideographRuns, lookupPietherWord } from './pietherDictionary'

const ts = () => new Date().toISOString()

function sameForm(word: Word, form: string, language: LanguageCode): boolean {
  const needle = foldSurface(form, language)
  return wordMatchSurfaces(word).some((surface) => foldSurface(surface, language) === needle)
}

async function findExact(
  repos: Repositories,
  language: LanguageCode,
  form: string,
  catalog?: WordCatalog,
): Promise<Word | null> {
  if (catalog) return catalog.findExact(language, form)
  const matches = await repos.words.findByWordSubstring(form, language)
  return matches.find((word) => sameForm(word, form, language)) ?? null
}

function blankWord(
  form: string,
  language: LanguageCode,
  authorId: ID,
  multilingualDictionary: 'found' | 'missing',
): Word {
  const surface = normalizeWordStress(form).trim() || form
  const character = ideographRuns(surface)
  return {
    id: `word-${crypto.randomUUID()}`,
    language,
    word: surface,
    ...(character ? { character } : {}),
    multilingualDictionary,
    translations: {},
    type: 'other',
    rootWords: [],
    grammarConstructions: [],
    createdBy: authorId,
    createdAt: ts(),
    updatedAt: ts(),
  }
}

/** If the form is missing from our database, load it from the dictionary and store every translation. */
export async function importMissingWord(
  repos: Repositories,
  surface: string,
  language: LanguageCode,
  authorId: ID,
  catalog?: WordCatalog,
): Promise<Word | null> {
  const existing = await findExact(repos, language, surface, catalog)
  if (existing) return existing

  const lookup = await lookupPietherWord(surface)
  if (lookup.status === 'unavailable') return null
  if (lookup.status === 'missing') {
    const created = await repos.words.create(blankWord(surface, language, authorId, 'missing'))
    catalog?.remember(created)
    return created
  }

  const forms = formsFromDictionaryEntry(lookup.entry, surface, language)
  const stored: Word[] = []
  for (const [lang, list] of forms) {
    for (const form of list) {
      const found = await findExact(repos, lang, form, catalog)
      if (!found) {
        const created = await repos.words.create(blankWord(form, lang, authorId, 'found'))
        catalog?.remember(created)
        stored.push(created)
        continue
      }
      if (found.multilingualDictionary === 'missing') {
        const updated = await repos.words.update({ ...found, multilingualDictionary: 'found', updatedAt: ts() })
        catalog?.remember(updated)
        stored.push(updated)
        continue
      }
      stored.push(found)
    }
  }

  for (const word of stored) {
    const translations = { ...word.translations }
    let changed = false
    for (const other of stored) {
      if (other.id === word.id || other.language === word.language) continue
      const links = translations[other.language] ? [...translations[other.language]!] : []
      if (!links.includes(other.id)) {
        links.push(other.id)
        translations[other.language] = links
        changed = true
      }
    }
    if (changed) {
      const updated = await repos.words.update({ ...word, translations, updatedAt: ts() })
      catalog?.remember(updated)
      const index = stored.findIndex((item) => item.id === word.id)
      if (index >= 0) stored[index] = updated
    }
  }

  return stored.find((word) => word.language === language && sameForm(word, surface, language)) ?? null
}
