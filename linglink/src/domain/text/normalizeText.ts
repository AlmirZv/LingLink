import type { NormalizedText } from '@/types/analysis'

export function normalizeText(original: string): NormalizedText {
  const normalized = original
    .normalize('NFC')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
  return { original, normalized }
}
