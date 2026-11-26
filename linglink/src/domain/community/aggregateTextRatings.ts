import type { RatingSummary, TextRating, TextRatings } from '@/types/db'

function summarize(values: number[]): RatingSummary {
  if (!values.length) return { average: 0, count: 0 }
  const sum = values.reduce((a, b) => a + b, 0)
  return { average: sum / values.length, count: values.length }
}

export function aggregateTextRatings(ratings: TextRating[]): TextRatings {
  return {
    usefulness: summarize(ratings.map((r) => r.usefulness).filter((n): n is number => n !== undefined)),
    interestingness: summarize(
      ratings.map((r) => r.interestingness).filter((n): n is number => n !== undefined),
    ),
    uniqueness: summarize(ratings.map((r) => r.uniqueness).filter((n): n is number => n !== undefined)),
    learningValue: summarize(
      ratings.map((r) => r.learningValue).filter((n): n is number => n !== undefined),
    ),
    totalVotes: ratings.length,
  }
}
