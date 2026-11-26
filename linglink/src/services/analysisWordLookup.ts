import type { AnalysisWordLookup } from '@/types/analysis'
import { foldSurface } from '@/constants/languages'
import { wordMatchSurfaces } from '@/domain/words/characterReading'
import type { LanguageCode, Word } from '@/types/db'
import type { Repositories } from '@/services/repositories/contracts'
import type { WordCatalog } from '@/services/wordCatalog'

function normalizeForMatch(text: string, language: LanguageCode): string {
  return foldSurface(text, language)
}

function exactSurface(word: Word, normalized: string, language: LanguageCode): boolean {
  return wordMatchSurfaces(word).some((surface) => normalizeForMatch(surface, language) === normalized)
}

export function createAnalysisWordLookup(repos: Repositories, catalog?: WordCatalog): AnalysisWordLookup {
  return {
    async findWord(language, normalized) {
      if (catalog) return catalog.findExact(language, normalized)
      const matches = await repos.words.findByWordSubstring(normalized, language)
      return matches.find((w) => exactSurface(w, normalized, language)) ?? null
    },
    async getWordById(id) {
      if (catalog) return catalog.getById(id)
      return repos.words.getById(id)
    },
    async getConstructionById(id) {
      return repos.constructions.getById(id)
    },
  }
}
