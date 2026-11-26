import type { TextComment } from '@/types/db'

export const MOCK_SOCIAL_STORAGE_KEY = 'linglink.mock.social.v1'

export interface PersistedCommentReaction {
  userId: string
  textId: string
  commentId: string
  type: 'like' | 'dislike'
}

export interface PersistedSocial {
  comments: TextComment[]
  commentReactions: PersistedCommentReaction[]
}

export function loadPersistedSocial(): PersistedSocial {
  try {
    const raw = localStorage.getItem(MOCK_SOCIAL_STORAGE_KEY)
    if (!raw) return { comments: [], commentReactions: [] }
    const parsed = JSON.parse(raw) as Partial<PersistedSocial>
    return {
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      commentReactions: Array.isArray(parsed.commentReactions) ? parsed.commentReactions : [],
    }
  } catch {
    return { comments: [], commentReactions: [] }
  }
}

export function savePersistedSocial(data: PersistedSocial): void {
  localStorage.setItem(MOCK_SOCIAL_STORAGE_KEY, JSON.stringify(data))
}

export function commentReactionKey(userId: string, commentId: string): string {
  return `${userId}::${commentId}`
}
