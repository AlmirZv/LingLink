import type { LearningText } from '@/types/db'

/** Rough reading time for catalog (minutes). */
export function estimateReadingMinutes(text: LearningText): number {
  return Math.max(1, Math.ceil(text.sentenceCount * 0.75))
}
