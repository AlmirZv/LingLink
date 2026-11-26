export const cacheKeys = {
  words: 'words',
  texts: 'publishedTexts',
  topics: 'topics',
  outbox: 'outbox',
  syncMeta: 'syncMeta',
  wordProgress: (userId: string) => `wordProgress:${userId}`,
  textProgress: (userId: string) => `textProgress:${userId}`,
  wordTextHistory: (userId: string) => `wordTextHistory:${userId}`,
} as const
