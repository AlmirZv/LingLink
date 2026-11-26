import { describe, expect, it } from 'vitest'

import { aggregateProposalVotes } from '@/domain/community/aggregateVotes'
import { aggregateTextRatings } from '@/domain/community/aggregateTextRatings'

describe('aggregateProposalVotes', () => {
  it('counts up and down votes', () => {
    const result = aggregateProposalVotes([
      { id: '1', userId: 'u1', proposalId: 'p1', type: 'word', value: 1, createdAt: '' },
      { id: '2', userId: 'u2', proposalId: 'p1', type: 'word', value: 1, createdAt: '' },
      { id: '3', userId: 'u3', proposalId: 'p1', type: 'word', value: -1, createdAt: '' },
    ])
    expect(result).toEqual({ up: 2, down: 1 })
  })
})

describe('aggregateTextRatings', () => {
  it('averages usefulness and interestingness', () => {
    const result = aggregateTextRatings([
      {
        id: 'r1',
        textId: 't1',
        userId: 'u1',
        usefulness: 4,
        interestingness: 2,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'r2',
        textId: 't1',
        userId: 'u2',
        usefulness: 2,
        interestingness: 4,
        createdAt: '',
        updatedAt: '',
      },
    ])
    expect(result.usefulness.average).toBe(3)
    expect(result.usefulness.count).toBe(2)
    expect(result.interestingness.average).toBe(3)
    expect(result.totalVotes).toBe(2)
  })
})
