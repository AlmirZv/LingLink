import { foldSurface } from '@/constants/languages'
import { segmentChinese } from '@/domain/text/chineseSegment'
import { segmentJapanese } from '@/domain/text/japaneseSegment'
import { segmentKorean } from '@/domain/text/koreanSegment'
import type { LanguageCode } from '@/types/db'
import type { SentenceDraft, Token, TokenType } from '@/types/analysis'

let tokenIdCounter = 0

export function resetTokenIdCounterForTests(): void {
  tokenIdCounter = 0
}

function nextTokenId(): string {
  tokenIdCounter += 1
  return `token_${tokenIdCounter}`
}

function normalizeToken(text: string, language: LanguageCode, type: TokenType): string {
  if (type !== 'word') return text
  return foldSurface(text, language)
}

const JAPANESE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u
const HAN = /\p{Script=Han}/u
const HANGUL = /\p{Script=Hangul}/u

function expandPart(part: string, language: LanguageCode): string[] {
  if (language === 'ja' && JAPANESE_SCRIPT.test(part)) return segmentJapanese(part)
  if (language === 'zh' && HAN.test(part)) return segmentChinese(part)
  if (language === 'ko' && HANGUL.test(part)) return segmentKorean(part)
  return [part]
}

/** Join a string into one run of letters for the split-editor check. */
export function compactText(text: string): string {
  return text.normalize('NFC').replace(/[\s\u00A0\u200B-\u200D\u2060\uFEFF\u3000]+/gu, '')
}

export function sameLettersIgnoringSpaces(left: string, right: string): boolean {
  return compactText(left) === compactText(right)
}

export function parseSpacedSurfaces(input: string): string[] {
  return input.trim().split(/\s+/u).filter(Boolean)
}

function tokenTypeOf(part: string): TokenType {
  if (/^[\p{L}]+$/u.test(part)) return 'word'
  if (/^[0-9]+$/u.test(part)) return 'number'
  if (/^[^\s\p{L}\p{N}]+$/u.test(part)) return 'punctuation'
  return 'other'
}

export function tokensFromSurfaces(
  sentence: Pick<SentenceDraft, 'id'>,
  surfaces: string[],
  language: LanguageCode,
): Token[] {
  return surfaces.map((part, index) => {
    const type = tokenTypeOf(part)
    return {
      id: nextTokenId(),
      sentenceId: sentence.id,
      position: index,
      text: part,
      normalized: normalizeToken(part, language, type),
      type,
    }
  })
}

/** Tokenize one sentence (words + punctuation). Japanese, Chinese and Korean letter-runs are segmented. */
export function tokenizeSentence(sentence: SentenceDraft, language: LanguageCode): Token[] {
  const text = sentence.text
  const parts = text.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]+/gu) ?? []
  const pieces = parts.flatMap((part) => expandPart(part, language))
  return tokensFromSurfaces(sentence, pieces, language)
}

export function tokenizeAll(sentences: SentenceDraft[], language: LanguageCode): Token[] {
  return sentences.flatMap((s) => tokenizeSentence(s, language))
}
