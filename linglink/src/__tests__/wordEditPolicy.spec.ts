// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  EDIT_BAN_LIMIT,
  EDIT_BAN_MS,
  banEndsAt,
  editVerdict,
  qualifiesAsModerator,
  shouldRemoveTranslation,
} from '@/domain/words/wordEditPolicy'

describe('editVerdict', () => {
  it('accepts when ups lead by 10 and downs stay under 100', () => {
    expect(editVerdict(10, 0)).toBe('accept')
    expect(editVerdict(20, 10)).toBe('accept')
    expect(editVerdict(9, 0)).toBe('pending')
  })

  it('removes an edit past 100 downs and bans only when ups do not lead', () => {
    expect(editVerdict(10, 101)).toBe('reject-ban')
    expect(editVerdict(102, 101)).toBe('reject')
  })
})

describe('banEndsAt', () => {
  it('expires after a month until the fifth ban, which does not expire', () => {
    const start = Date.parse('2026-01-01T00:00:00.000Z')
    expect(banEndsAt(start, 0)).toBe(start + EDIT_BAN_MS)
    expect(banEndsAt(start, EDIT_BAN_LIMIT - 1)).toBeUndefined()
  })
})

describe('shouldRemoveTranslation', () => {
  it('removes a barely used translation when dislikes lead by 10', () => {
    expect(shouldRemoveTranslation({ up: 0, down: 10, textCount: 1 })).toBe(true)
    expect(shouldRemoveTranslation({ up: 2, down: 12, textCount: 0 })).toBe(true)
    expect(shouldRemoveTranslation({ up: 0, down: 9, textCount: 0 })).toBe(false)
  })

  it('keeps a translation that texts actually use', () => {
    expect(shouldRemoveTranslation({ up: 0, down: 10, textCount: 4 })).toBe(false)
  })

  it('with many votes, removes it when dislikes are at least double and texts are few', () => {
    expect(shouldRemoveTranslation({ up: 10, down: 20, textCount: 1 })).toBe(true)
    expect(shouldRemoveTranslation({ up: 20, down: 30, textCount: 1 })).toBe(false)
    expect(shouldRemoveTranslation({ up: 5, down: 40, textCount: 20 })).toBe(false)
  })
})

describe('qualifiesAsModerator', () => {
  it('requires finished texts, known words, and a strong rating average', () => {
    expect(
      qualifiesAsModerator({ finishedTexts: 3, knownWords: 10, ratingCount: 3, ratingAverage: 4 }),
    ).toBe(true)
    expect(
      qualifiesAsModerator({ finishedTexts: 3, knownWords: 10, ratingCount: 2, ratingAverage: 5 }),
    ).toBe(false)
    expect(
      qualifiesAsModerator({ finishedTexts: 2, knownWords: 10, ratingCount: 3, ratingAverage: 5 }),
    ).toBe(false)
  })
})
