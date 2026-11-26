// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { compactText, parseSpacedSurfaces, tokensFromSurfaces } from '@/domain/text/tokenizer'
import type { Repositories } from '@/services/repositories/contracts'
import {
  retokenizeScanSentence,
  spacedScanSentence,
  transferScanTranslations,
  type ScanColumn,
  type TextScan,
} from '@/services/textScan'
import type { AnalyzedSentence } from '@/types/analysis'

function wordColumn(text: string, translation = ''): ScanColumn {
  return {
    id: `col-${text}`,
    kind: 'word',
    text,
    normalized: text,
    selectedTranslationId: translation,
  }
}

describe('sentence word splits', () => {
  it('parses spaces into surfaces and keeps letters when compacting', () => {
    expect(parseSpacedSurfaces('  読んだりしてい ます  ')).toEqual(['読んだりしてい', 'ます'])
    expect(compactText('読んだりしてい ます')).toBe('読んだりしています')
  })

  it('builds tokens from edited surfaces', () => {
    const tokens = tokensFromSurfaces({ id: 's1' }, ['読んだりして', 'います'], 'ja')
    expect(tokens.map((token) => token.text)).toEqual(['読んだりして', 'います'])
    expect(tokens.every((token) => token.type === 'word')).toBe(true)
  })

  it('copies a translation only when the same letters stay one word', () => {
    const previous = [wordColumn('読んだりしてい', 't-left'), wordColumn('ます', 't-masu')]
    const joined = transferScanTranslations(previous, [wordColumn('読んだりしています')])
    expect(joined[0]?.selectedTranslationId).toBe('')
    const kept = transferScanTranslations(previous, [wordColumn('読んだりしてい'), wordColumn('ます')])
    expect(kept.map((column) => column.selectedTranslationId)).toEqual(['t-left', 't-masu'])
  })
})

describe('retokenizeScanSentence', () => {
  const repos = {
    words: { listAll: async () => [] },
    constructions: { getById: async () => null },
  } as unknown as Repositories

  function scanOf(columns: ScanColumn[]): TextScan {
    const analyzed: AnalyzedSentence = {
      id: 's1',
      position: 0,
      text: columns.map((column) => column.text).join(''),
      tokens: tokensFromSurfaces(
        { id: 's1' },
        columns.map((column) => column.text),
        'ja',
      ),
    }
    return {
      analysis: {
        originalText: analyzed.text,
        normalizedText: analyzed.text,
        language: 'ja',
        sentences: [analyzed],
        words: [],
        constructions: [],
        statistics: {
          sentenceCount: 1,
          totalWordCount: columns.filter((column) => column.kind === 'word').length,
          uniqueWordCount: 1,
          knownWordsCount: 0,
          unknownWordsCount: 1,
          repeatedWordsCount: 0,
          rootWordGroupsCount: 0,
          constructionCount: 0,
        },
      },
      sentences: [{ id: 's1', columns }],
      words: {},
      targetLanguage: 'ru',
      sentenceCount: 1,
      uniqueWordCount: 1,
    }
  }

  it('joins two Japanese pieces into one word', async () => {
    const scan = scanOf([wordColumn('読んだりしてい'), wordColumn('ます')])
    expect(spacedScanSentence(scan.sentences[0]!.columns)).toBe('読んだりしてい ます')
    const result = await retokenizeScanSentence(scan, 's1', '読んだりしています', repos)
    expect(result).toEqual({ ok: true })
    expect(scan.sentences[0]!.columns.map((column) => column.text)).toEqual(['読んだりしています'])
  })

  it('rejects edits that change letters', async () => {
    const scan = scanOf([wordColumn('読んだりしてい'), wordColumn('ます')])
    const result = await retokenizeScanSentence(scan, 's1', '読みます', repos)
    expect(result).toEqual({ ok: false, reason: 'mismatch' })
    expect(scan.sentences[0]!.columns).toHaveLength(2)
  })

  it('allows new spaces when letters of the original sentence stay the same', async () => {
    const scan = scanOf([wordColumn('абвг')])
    scan.analysis.sentences[0]!.text = 'аб вг'
    const result = await retokenizeScanSentence(scan, 's1', 'а бвг', repos)
    expect(result).toEqual({ ok: true })
  })
})
