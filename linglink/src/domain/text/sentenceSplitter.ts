import type { SentenceDraft } from '@/types/analysis'

let sentenceIdCounter = 0

export function resetSentenceIdCounterForTests(): void {
  sentenceIdCounter = 0
}

function nextSentenceId(): string {
  sentenceIdCounter += 1
  return `sentence_${sentenceIdCounter}`
}

/**
 * Split on line breaks and sentence-ending punctuation.
 * Keeps punctuation inside sentence text.
 */
export function splitIntoSentences(normalizedText: string): SentenceDraft[] {
  const chunks = normalizedText
    .split(/\n+/)
    .flatMap((line) => line.match(/[^.!?。！？؟]+[.!?。！？؟]?/gu) ?? [])
    .map((s) => s.trim())
    .filter(Boolean)

  return chunks.map((text, position) => ({
    id: nextSentenceId(),
    position,
    text,
  }))
}
