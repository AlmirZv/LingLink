import type { EditBan, Report, TextRating, TranslationVote, UserNotification, WordEdit, WordEditVote } from '@/types/db'

export const MOCK_COMMUNITY_STORAGE_KEY = 'linglink.mock.community.v1'

export interface PersistedCommunity {
  translationVotes: TranslationVote[]
  textRatings: TextRating[]
  reports: Report[]
  wordEdits: WordEdit[]
  wordEditVotes: WordEditVote[]
  editBans: EditBan[]
  notifications: UserNotification[]
}

function emptyCommunity(): PersistedCommunity {
  return {
    translationVotes: [],
    textRatings: [],
    reports: [],
    wordEdits: [],
    wordEditVotes: [],
    editBans: [],
    notifications: [],
  }
}

export function loadPersistedCommunity(): PersistedCommunity {
  try {
    const raw = localStorage.getItem(MOCK_COMMUNITY_STORAGE_KEY)
    if (!raw) return emptyCommunity()
    const parsed = JSON.parse(raw) as Partial<PersistedCommunity>
    return {
      translationVotes: Array.isArray(parsed.translationVotes) ? parsed.translationVotes : [],
      textRatings: Array.isArray(parsed.textRatings) ? parsed.textRatings : [],
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
      wordEdits: Array.isArray(parsed.wordEdits) ? parsed.wordEdits : [],
      wordEditVotes: Array.isArray(parsed.wordEditVotes) ? parsed.wordEditVotes : [],
      editBans: Array.isArray(parsed.editBans) ? parsed.editBans : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
    }
  } catch {
    return emptyCommunity()
  }
}

export function savePersistedCommunity(data: PersistedCommunity): void {
  localStorage.setItem(MOCK_COMMUNITY_STORAGE_KEY, JSON.stringify(data))
}

export function voteKey(userId: string, proposalId: string): string {
  return `${userId}::${proposalId}`
}

export function ratingKey(userId: string, textId: string): string {
  return `${userId}::${textId}`
}
