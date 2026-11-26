import type { UserTextProgress, UserWordProgress, UserWordTextHistory } from '@/types/db'

import { MOCK_PROGRESS_STORAGE_KEY } from './constants'

export interface TextUserMark {
  userId: string
  textId: string
}

export interface PersistedUserProgress {
  wordProgress: UserWordProgress[]
  textProgress: UserTextProgress[]
  wordTextHistory: UserWordTextHistory[]
  textViews?: TextUserMark[]
  textLikes?: TextUserMark[]
  textDislikes?: TextUserMark[]
  textSaves?: TextUserMark[]
}

export function loadPersistedProgress(): PersistedUserProgress | null {
  try {
    const raw = localStorage.getItem(MOCK_PROGRESS_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersistedUserProgress
  } catch {
    return null
  }
}

export function savePersistedProgress(data: PersistedUserProgress): void {
  localStorage.setItem(MOCK_PROGRESS_STORAGE_KEY, JSON.stringify(data))
}

export function wordProgressKey(userId: string, wordId: string): string {
  return `${userId}::${wordId}`
}

export function textProgressKey(userId: string, textId: string): string {
  return `${userId}::${textId}`
}

export function splitUserTextKey(key: string): { userId: string; textId: string } {
  const splitAt = key.indexOf('::')
  return { userId: key.slice(0, splitAt), textId: key.slice(splitAt + 2) }
}

export function historyKey(userId: string, wordId: string, textId: string): string {
  return `${userId}::${wordId}::${textId}`
}
