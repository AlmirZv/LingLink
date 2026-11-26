export type Reaction = 'like' | 'dislike'

export function exclusiveReaction(
  likes: number,
  dislikes: number,
  current: Reaction | null,
  pressed: Reaction,
): { likes: number; dislikes: number; reaction: Reaction | null } {
  const without = (kind: Reaction | null, likeCount: number, dislikeCount: number) => {
    if (kind === 'like') return { likes: Math.max(0, likeCount - 1), dislikes: dislikeCount }
    if (kind === 'dislike') return { likes: likeCount, dislikes: Math.max(0, dislikeCount - 1) }
    return { likes: likeCount, dislikes: dislikeCount }
  }
  if (current === pressed) return { ...without(current, likes, dislikes), reaction: null }
  const cleared = without(current, likes, dislikes)
  if (pressed === 'like') return { likes: cleared.likes + 1, dislikes: cleared.dislikes, reaction: 'like' }
  return { likes: cleared.likes, dislikes: cleared.dislikes + 1, reaction: 'dislike' }
}
