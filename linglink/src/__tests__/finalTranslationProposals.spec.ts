// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  applyFinalProposals,
  likeFinalProposal,
  sortFinalProposals,
  upsertOwnFinalProposal,
  winningFinalProposal,
} from '@/domain/text/finalTranslationProposals'
import type { FinalTranslationProposal, LearningText } from '@/types/db'

function proposal(
  id: string,
  likes: string[],
  addedAt = '2026-01-01T00:00:00.000Z',
  addedBy = 'u1',
): FinalTranslationProposal {
  return { id, text: id, addedBy, addedAt, likedBy: likes }
}

describe('final translation proposals', () => {
  it('sorts by like count then recency', () => {
    const sorted = sortFinalProposals([
      proposal('a', ['x'], '2026-01-01T00:00:00.000Z'),
      proposal('b', ['x', 'y'], '2026-01-01T00:00:00.000Z'),
      proposal('c', ['x', 'y'], '2026-02-01T00:00:00.000Z'),
    ])
    expect(sorted.map((item) => item.id)).toEqual(['c', 'b', 'a'])
  })

  it('keeps a like exclusive to one proposal', () => {
    const next = likeFinalProposal(
      [proposal('a', ['u2']), proposal('b', [])],
      'b',
      'u2',
    )
    expect(next.find((item) => item.id === 'a')?.likedBy).toEqual([])
    expect(next.find((item) => item.id === 'b')?.likedBy).toEqual(['u2'])
  })

  it('updates an existing proposal from the same author', () => {
    const next = upsertOwnFinalProposal([proposal('a', [], '2026-01-01T00:00:00.000Z', 'u1')], 'u1', 'new text')
    expect(next).toHaveLength(1)
    expect(next[0]?.text).toBe('new text')
  })

  it('writes the top proposal of each sentence as the stored final', () => {
    const text = {
      id: 't1',
      finalTranslations: {},
      sentences: [
        { id: 's1', position: 0, words: [{ id: 'w1' }] },
        { id: 's2', position: 1, words: [{ id: 'w2' }] },
      ],
    } as LearningText
    const stored = applyFinalProposals(
      text,
      [
        { ...proposal('low', ['x']), sentenceId: 's1' },
        { ...proposal('top', ['x', 'y']), sentenceId: 's1' },
        { ...proposal('second', ['x']), sentenceId: 's2' },
      ],
      'ru',
    )
    expect(stored.finalTranslations.ru?.text).toBe('top\nsecond')
    expect(winningFinalProposal(stored.finalTranslations.ru?.proposals ?? [])?.id).toBe('top')
    expect(stored.sentences[0]?.finalProposals?.ru?.map((item) => item.id)).toEqual(['top', 'low'])
    expect(stored.sentences[1]?.finalProposals?.ru?.[0]?.addedBy).toBe('u1')
    expect(stored.sentences[0]?.finalProposals?.ru?.[0]?.likedBy).toEqual(['x', 'y'])
  })
})
