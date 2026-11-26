import type { LearningText } from '@/types/db'

import { textEditCount } from './communityEdits'

export type TextPublicStats = {
  views: number
  likes: number
  comments: number
  edits: number
}

export function applyCountedPublicStats(
  text: LearningText,
  counts: { views: number; likes: number; dislikes: number; comments: number },
): LearningText {
  if (
    text.views === counts.views &&
    text.favoritesCount === counts.likes &&
    (text.dislikesCount ?? 0) === counts.dislikes &&
    (text.commentsCount ?? 0) === counts.comments
  ) {
    return text
  }
  return {
    ...text,
    views: counts.views,
    favoritesCount: counts.likes,
    dislikesCount: counts.dislikes,
    commentsCount: counts.comments,
  }
}

export function publicStatsOf(text: LearningText): TextPublicStats {
  return {
    views: text.views,
    likes: text.favoritesCount,
    comments: text.commentsCount ?? 0,
    edits: textEditCount(text),
  }
}
