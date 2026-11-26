import type {
  LearningText,
  Report,
  TextComment,
  TextRating,
  TranslationVote,
  UserNotification,
  UserWordProgress,
  UserWordTextHistory,
  Word,
} from '@/types/db'
import { exclusiveReaction } from '@/domain/text/exclusiveReaction'
import { applyCountedPublicStats } from '@/domain/text/publicStats'
import type { Repositories } from '@/services/repositories/contracts'

import { wordMatchesQuery } from '@/domain/words/characterReading'
import { absorbWord, wordSurfaceKey } from '@/domain/words/mergeDuplicateWords'
import { syncWordsForText } from '@/services/syncTextWordIndex'
import { withOccurrenceWordIds } from '@/domain/words/textAppearances'
import { MockDatabase } from './mockDatabase'
import { historyKey, textProgressKey, wordProgressKey } from './persistProgress'
import { commentReactionKey } from './persistSocial'
import { ratingKey, voteKey } from './persistCommunity'

const ts = () => new Date().toISOString()

function includesIgnoreCase(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase())
}

function countMarks(set: Set<string>, textId: string): number {
  const suffix = `::${textId}`
  let count = 0
  for (const key of set) {
    if (key.endsWith(suffix)) count += 1
  }
  return count
}

export function createMockRepositories(db: MockDatabase): Repositories {
  const words: Repositories['words'] = {
    async getById(id) {
      return db.words.get(id) ?? null
    },
    async listByIds(ids) {
      return ids.map((id) => db.words.get(id)).filter((w): w is Word => w !== undefined)
    },
    async listAll() {
      return [...db.words.values()].sort((a, b) => a.word.localeCompare(b.word))
    },
    async listUpdatedSince(updatedAfter) {
      return [...db.words.values()].filter((word) => String(word.updatedAt) > updatedAfter)
    },
    async findByWordSubstring(query, language) {
      const q = query.trim()
      if (!q) return []
      return [...db.words.values()].filter(
        (w) => wordMatchesQuery(w, q) && (language === undefined || w.language === language),
      )
    },
    async create(word) {
      const existing = [...db.words.values()].find(
        (stored) => stored.id !== word.id && wordSurfaceKey(stored) === wordSurfaceKey(word),
      )
      if (existing) {
        const absorbed = absorbWord(existing, word)
        db.words.set(absorbed.id, absorbed)
        db.persistCatalog()
        return absorbed
      }
      db.words.set(word.id, word)
      db.persistCatalog()
      return word
    },
    async update(word) {
      db.words.set(word.id, { ...word, updatedAt: ts() })
      db.persistCatalog()
      return db.words.get(word.id)!
    },
  }

  const constructions: Repositories['constructions'] = {
    async getById(id) {
      return db.constructions.get(id) ?? null
    },
    async findBySubstring(query, language) {
      const q = query.trim()
      if (!q) return []
      return [...db.constructions.values()].filter((c) => {
        if (language !== undefined && c.language !== language) return false
        if (includesIgnoreCase(c.construction, q)) return true
        return c.forms.some((f) => includesIgnoreCase(f, q))
      })
    },
    async create(construction) {
      db.constructions.set(construction.id, construction)
      db.persistCatalog()
      return construction
    },
    async update(construction) {
      const updated = { ...construction, updatedAt: ts() }
      db.constructions.set(construction.id, updated)
      db.persistCatalog()
      return updated
    },
  }

  const texts: Repositories['texts'] = {
    async listPublished() {
      return [...db.texts.values()]
        .filter((t) => t.status === 'published')
        .sort((a, b) => a.title.localeCompare(b.title))
    },
    async forEachPublishedPage(pageSize, onPage) {
      const published = await texts.listPublished()
      const size = Math.max(1, pageSize)
      for (let index = 0; index < published.length; index += size) {
        await onPage(published.slice(index, index + size))
      }
    },
    async listUpdatedSince(updatedAfter) {
      return [...db.texts.values()].filter(
        (text) => text.status === 'published' && String(text.updatedAt) > updatedAfter,
      )
    },
    async getById(id) {
      return db.texts.get(id) ?? null
    },
    async findByTitleSubstring(query) {
      const q = query.trim()
      if (!q) return []
      return [...db.texts.values()].filter(
        (t) => t.status === 'published' && includesIgnoreCase(t.title, q),
      )
    },
    async findByWordId(wordId) {
      return [...db.texts.values()].filter(
        (t) => t.status === 'published' && t.wordIds.includes(wordId),
      )
    },
    async findByConstructionId(constructionId) {
      return [...db.texts.values()].filter(
        (t) => t.status === 'published' && t.constructionIds.includes(constructionId),
      )
    },
    async listByAuthor(authorId) {
      return [...db.texts.values()]
        .filter((t) => t.authorId === authorId && t.status !== 'deleted')
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    },
    async create(text) {
      db.texts.set(text.id, text)
      db.persistCatalog()
      return text
    },
    async update(text) {
      const previous = db.texts.get(text.id) ?? null
      const updated = { ...withOccurrenceWordIds(text), updatedAt: ts() }
      db.texts.set(text.id, updated)
      await syncWordsForText(words, previous, updated)
      db.persistCatalog()
      return updated
    },
    async recordView(userId, textId) {
      const text = db.texts.get(textId)
      if (!text || text.status === 'draft') return text ?? null
      const key = textProgressKey(userId, textId)
      if (!db.textViews.has(key)) {
        db.textViews.add(key)
        db.persistUserData()
        return syncPublicStats(textId, true)
      }
      return syncPublicStats(textId)
    },
    async toggleLike(userId, textId) {
      return applyTextReaction(userId, textId, 'like')
    },
    async toggleDislike(userId, textId) {
      return applyTextReaction(userId, textId, 'dislike')
    },
    async isLiked(userId, textId) {
      return db.textLikes.has(textProgressKey(userId, textId))
    },
    async isDisliked(userId, textId) {
      return db.textDislikes.has(textProgressKey(userId, textId))
    },
    async toggleSaved(userId, textId) {
      const key = textProgressKey(userId, textId)
      const saved = db.textSaves.has(key)
      if (saved) db.textSaves.delete(key)
      else db.textSaves.add(key)
      db.persistUserData()
      return !saved
    },
    async isSaved(userId, textId) {
      return db.textSaves.has(textProgressKey(userId, textId))
    },
    async listSaved(userId) {
      const ids = [...db.textSaves]
        .filter((key) => key.startsWith(`${userId}::`))
        .map((key) => key.slice(userId.length + 2))
      return ids
        .map((id) => db.texts.get(id))
        .filter((text): text is NonNullable<typeof text> => Boolean(text && text.status !== 'deleted'))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    },
    async listByStatus(status) {
      return [...db.texts.values()].filter((text) => text.status === status)
    },
    async syncPublicStats(textId) {
      return syncPublicStats(textId)
    },
  }

  function syncPublicStats(textId: string, touch = false): LearningText | null {
    const text = db.texts.get(textId)
    if (!text) return null
    const next = applyCountedPublicStats(text, {
      views: countMarks(db.textViews, textId),
      likes: countMarks(db.textLikes, textId),
      dislikes: countMarks(db.textDislikes, textId),
      comments: db.comments.filter((comment) => comment.textId === textId).length,
    })
    if (next === text && !touch) return text
    const stored = touch ? { ...next, updatedAt: ts() } : next
    db.texts.set(textId, stored)
    db.persistCatalog()
    return stored
  }

  function applyTextReaction(userId: string, textId: string, pressed: 'like' | 'dislike') {
    const text = db.texts.get(textId)
    if (!text) return null
    const key = textProgressKey(userId, textId)
    const current = db.textLikes.has(key) ? 'like' : db.textDislikes.has(key) ? 'dislike' : null
    const next = exclusiveReaction(text.favoritesCount, text.dislikesCount ?? 0, current, pressed)
    if (next.reaction === 'like') db.textLikes.add(key)
    else db.textLikes.delete(key)
    if (next.reaction === 'dislike') db.textDislikes.add(key)
    else db.textDislikes.delete(key)
    db.persistUserData()
    const updated = syncPublicStats(textId, true)
    if (!updated) return null
    return { text: updated, liked: next.reaction === 'like', disliked: next.reaction === 'dislike' }
  }

  const users: Repositories['users'] = {
    async getById(id) {
      return db.users.get(id) ?? null
    },
    async upsert(user) {
      db.users.set(user.id, user)
    },
  }

  const progress: Repositories['progress'] = {
    async getWordProgress(userId, wordId) {
      return db.wordProgress.get(wordProgressKey(userId, wordId)) ?? null
    },
    async listWordProgress(userId) {
      return [...db.wordProgress.values()].filter((p) => p.userId === userId)
    },
    async setWordLevel(userId, wordId, level) {
      const clamped = Math.min(5, Math.max(0, Math.round(level)))
      const entry: UserWordProgress = {
        userId,
        wordId,
        level: clamped,
        updatedAt: ts(),
      }
      db.wordProgress.set(wordProgressKey(userId, wordId), entry)
      db.persistUserData()
      return entry
    },
    async getTextProgress(userId, textId) {
      return db.textProgress.get(textProgressKey(userId, textId)) ?? null
    },
    async listTextProgress(userId) {
      return [...db.textProgress.values()].filter((p) => p.userId === userId)
    },
    async upsertTextProgress(entry) {
      db.textProgress.set(textProgressKey(entry.userId, entry.textId), {
        ...entry,
        updatedAt: ts(),
      })
      db.persistUserData()
    },
  }

  const topics: Repositories['topics'] = {
    async list() {
      return [...db.topics.values()].sort((a, b) => a.name.localeCompare(b.name))
    },
    async getById(id) {
      return db.topics.get(id) ?? null
    },
    async create(topic) {
      db.topics.set(topic.id, topic)
      db.persistCatalog()
      return topic
    },
  }

  const series: Repositories['series'] = {
    async list() {
      return [...db.series.values()]
    },
    async listByAuthor(authorId) {
      return [...db.series.values()]
        .filter((item) => item.authorId === authorId)
        .sort((a, b) => a.title.localeCompare(b.title))
    },
    async getById(id) {
      return db.series.get(id) ?? null
    },
    async create(item) {
      db.series.set(item.id, item)
      db.persistCatalog()
      return item
    },
    async update(item) {
      db.series.set(item.id, item)
      db.persistCatalog()
      return item
    },
    async remove(id) {
      db.series.delete(id)
      db.persistCatalog()
    },
  }

  const reports: Repositories['reports'] = {
    async create(input) {
      const report: Report = {
        id: `report-${crypto.randomUUID()}`,
        ...input,
        createdAt: ts(),
      }
      db.reports.push(report)
      db.persistCommunity()
      return report
    },
  }

  const translationVotes: Repositories['translationVotes'] = {
    async castVote(input) {
      const key = voteKey(input.userId, input.proposalId)
      const vote: TranslationVote = {
        id: `vote-${crypto.randomUUID()}`,
        userId: input.userId,
        proposalId: input.proposalId,
        type: input.type,
        value: input.value,
        createdAt: ts(),
      }
      db.translationVotes.set(key, vote)
      db.persistCommunity()
      return vote
    },
    async getUserVote(userId, proposalId) {
      return db.translationVotes.get(voteKey(userId, proposalId)) ?? null
    },
    async listForProposal(proposalId) {
      return [...db.translationVotes.values()].filter((v) => v.proposalId === proposalId)
    },
  }

  const textRatings: Repositories['textRatings'] = {
    async upsert(input) {
      const key = ratingKey(input.userId, input.textId)
      const existing = db.textRatings.get(key)
      const rating: TextRating = {
        id: existing?.id ?? input.id ?? `rating-${crypto.randomUUID()}`,
        textId: input.textId,
        userId: input.userId,
        usefulness: input.usefulness,
        interestingness: input.interestingness,
        uniqueness: input.uniqueness,
        learningValue: input.learningValue,
        createdAt: existing?.createdAt ?? ts(),
        updatedAt: ts(),
      }
      db.textRatings.set(key, rating)
      db.persistCommunity()
      return rating
    },
    async getUserRating(userId, textId) {
      return db.textRatings.get(ratingKey(userId, textId)) ?? null
    },
    async listForText(textId) {
      return [...db.textRatings.values()].filter((r) => r.textId === textId)
    },
  }

  const wordTextHistory: Repositories['wordTextHistory'] = {
    async record(entry) {
      const key = historyKey(entry.userId, entry.wordId, entry.textId)
      const stored: UserWordTextHistory = { ...entry, learnedAt: entry.learnedAt ?? ts() }
      db.wordTextHistory.set(key, stored)
      db.persistUserData()
      return stored
    },
    async listForUser(userId) {
      return [...db.wordTextHistory.values()].filter((h) => h.userId === userId)
    },
    async countDistinctTexts(userId, wordId) {
      const textIds = new Set<string>()
      for (const h of db.wordTextHistory.values()) {
        if (h.userId === userId && h.wordId === wordId) textIds.add(h.textId)
      }
      return textIds.size
    },
    async listForWord(userId, wordId) {
      return [...db.wordTextHistory.values()].filter(
        (h) => h.userId === userId && h.wordId === wordId,
      )
    },
    async clearForWord(userId, wordId) {
      for (const [key, h] of db.wordTextHistory) {
        if (h.userId === userId && h.wordId === wordId) db.wordTextHistory.delete(key)
      }
      db.persistUserData()
    },
  }

  const wordEdits: Repositories['wordEdits'] = {
    async getById(id) {
      return db.wordEdits.find((edit) => edit.id === id) ?? null
    },
    async listForWord(wordId) {
      return db.wordEdits.filter((edit) => edit.wordId === wordId)
    },
    async listVotes(editId) {
      return [...db.wordEditVotes.values()].filter((vote) => vote.editId === editId)
    },
    async save(edit) {
      const index = db.wordEdits.findIndex((item) => item.id === edit.id)
      if (index >= 0) db.wordEdits[index] = edit
      else db.wordEdits.push(edit)
      db.persistCommunity()
      return edit
    },
    async saveVote(vote) {
      db.wordEditVotes.set(`${vote.userId}::${vote.editId}`, vote)
      db.persistCommunity()
      return vote
    },
    async listBans(userId) {
      return db.editBans.filter((ban) => ban.userId === userId)
    },
    async saveBan(ban) {
      db.editBans.push(ban)
      db.persistCommunity()
      return ban
    },
  }

  const comments: Repositories['comments'] = {
    async listForText(textId) {
      return db.comments
        .filter((comment) => comment.textId === textId)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    },
    async add(input) {
      const comment: TextComment = {
        id: `comment-${crypto.randomUUID()}`,
        textId: input.textId,
        authorId: input.authorId,
        body: input.body.trim(),
        parentId: input.parentId,
        ...(input.replyToAuthorId ? { replyToAuthorId: input.replyToAuthorId } : {}),
        likesCount: 0,
        dislikesCount: 0,
        createdAt: ts(),
      }
      db.comments.push(comment)
      db.persistSocial()
      syncPublicStats(input.textId, true)
      return comment
    },
    async toggleReaction(userId, textId, commentId, reaction) {
      const comment = db.comments.find((item) => item.id === commentId && item.textId === textId)
      if (!comment) return null
      const key = commentReactionKey(userId, commentId)
      const current = db.commentReactions.get(key)?.type ?? null
      const next = exclusiveReaction(comment.likesCount, comment.dislikesCount, current, reaction)
      if (next.reaction) {
        db.commentReactions.set(key, { userId, textId, commentId, type: next.reaction })
      } else {
        db.commentReactions.delete(key)
      }
      comment.likesCount = next.likes
      comment.dislikesCount = next.dislikes
      db.persistSocial()
      return { ...comment }
    },
    async reactionsFor(userId, textId) {
      const reactions: Record<string, 'like' | 'dislike'> = {}
      for (const reaction of db.commentReactions.values()) {
        if (reaction.userId === userId && reaction.textId === textId) reactions[reaction.commentId] = reaction.type
      }
      return reactions
    },
  }

  const notifications: Repositories['notifications'] = {
    async list(userId) {
      return [...db.notifications.values()]
        .filter((item) => item.userId === userId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    },
    async add(notification) {
      db.notifications.set(notification.id, notification)
      db.persistCommunity()
    },
    async markRead(userId, notificationId) {
      const stored = db.notifications.get(notificationId)
      if (!stored || stored.userId !== userId || stored.read) return
      const next: UserNotification = { ...stored, read: true }
      db.notifications.set(notificationId, next)
      db.persistCommunity()
    },
  }

  return {
    words,
    constructions,
    texts,
    users,
    progress,
    topics,
    series,
    reports,
    translationVotes,
    textRatings,
    wordTextHistory,
    wordEdits,
    comments,
    notifications,
  }
}
