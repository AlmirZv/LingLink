import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc as writeDoc,
  startAfter,
  where,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'

import type { Repositories } from '@/services/repositories/contracts'
import type {
  GrammarConstruction,
  LearningText,
  Report,
  TextComment,
  TextRating,
  TextSeries,
  Topic,
  TranslationVote,
  User,
  UserTextProgress,
  UserWordProgress,
  UserWordTextHistory,
  Word,
  WordEdit,
  WordEditVote,
  EditBan,
  UserNotification,
} from '@/types/db'

import { wordMatchesQuery } from '@/domain/words/characterReading'
import { absorbWord, wordSurfaceKey } from '@/domain/words/mergeDuplicateWords'
import { syncWordsForText } from '@/services/syncTextWordIndex'
import { withOccurrenceWordIds } from '@/domain/words/textAppearances'
import { exclusiveReaction } from '@/domain/text/exclusiveReaction'
import { applyCountedPublicStats } from '@/domain/text/publicStats'
import { COLLECTIONS } from './collections'
import { ratingKey, voteKey } from '../mock/persistCommunity'
import { historyKey } from '../mock/persistProgress'

const ts = () => new Date().toISOString()

function setDoc(
  reference: Parameters<typeof writeDoc>[0],
  data: unknown,
  options?: Parameters<typeof writeDoc>[2],
) {
  const payload = JSON.parse(JSON.stringify(data)) as never
  return options ? writeDoc(reference, payload, options) : writeDoc(reference, payload)
}

function includesIgnoreCase(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase())
}

export function createFirebaseRepositories(db: Firestore): Repositories {
  const words: Repositories['words'] = {
    async getById(id) {
      const snap = await getDoc(doc(db, COLLECTIONS.words, id))
      return snap.exists() ? (snap.data() as Word) : null
    },
    async listByIds(ids) {
      const rows = await Promise.all(ids.map((id) => words.getById(id)))
      return rows.filter((w): w is Word => w !== null)
    },
    async listAll() {
      const snap = await getDocs(collection(db, COLLECTIONS.words))
      return snap.docs.map((d) => d.data() as Word).sort((a, b) => a.word.localeCompare(b.word))
    },
    async listUpdatedSince(updatedAfter) {
      const q = query(collection(db, COLLECTIONS.words), where('updatedAt', '>', updatedAfter))
      const snap = await getDocs(q)
      return snap.docs.map((d) => d.data() as Word)
    },
    async findByWordSubstring(queryStr, language) {
      const q = queryStr.trim()
      if (!q) return []
      return (await words.listAll()).filter(
        (w) => wordMatchesQuery(w, q) && (language === undefined || w.language === language),
      )
    },
    async create(word) {
      const existing = (await words.listAll()).find(
        (stored) => stored.id !== word.id && wordSurfaceKey(stored) === wordSurfaceKey(word),
      )
      if (existing) {
        const absorbed = absorbWord(existing, word)
        await setDoc(doc(db, COLLECTIONS.words, absorbed.id), absorbed)
        return absorbed
      }
      await setDoc(doc(db, COLLECTIONS.words, word.id), word)
      return word
    },
    async update(word) {
      const updated = { ...word, updatedAt: ts() }
      await setDoc(doc(db, COLLECTIONS.words, word.id), updated)
      return updated
    },
  }

  const constructions: Repositories['constructions'] = {
    async getById(id) {
      const snap = await getDoc(doc(db, COLLECTIONS.grammarConstructions, id))
      return snap.exists() ? (snap.data() as GrammarConstruction) : null
    },
    async findBySubstring(queryStr, language) {
      const q = queryStr.trim()
      if (!q) return []
      const snap = await getDocs(collection(db, COLLECTIONS.grammarConstructions))
      return snap.docs
        .map((d) => d.data() as GrammarConstruction)
        .filter((c) => {
          if (language !== undefined && c.language !== language) return false
          if (includesIgnoreCase(c.construction, q)) return true
          return c.forms.some((f) => includesIgnoreCase(f, q))
        })
    },
    async create(construction) {
      await setDoc(doc(db, COLLECTIONS.grammarConstructions, construction.id), construction)
      return construction
    },
    async update(construction) {
      const updated = { ...construction, updatedAt: ts() }
      await setDoc(doc(db, COLLECTIONS.grammarConstructions, construction.id), updated)
      return updated
    },
  }

  const texts: Repositories['texts'] = {
    async listPublished() {
      const q = query(collection(db, COLLECTIONS.texts), where('status', '==', 'published'))
      const snap = await getDocs(q)
      return snap.docs
        .map((d) => d.data() as LearningText)
        .sort((a, b) => a.title.localeCompare(b.title))
    },
    async forEachPublishedPage(pageSize, onPage) {
      const size = Math.max(1, pageSize)
      try {
        let cursor: QueryDocumentSnapshot | undefined
        let delivered = 0
        for (;;) {
          const q = cursor
            ? query(
                collection(db, COLLECTIONS.texts),
                where('status', '==', 'published'),
                orderBy('updatedAt', 'desc'),
                startAfter(cursor),
                limit(size),
              )
            : query(
                collection(db, COLLECTIONS.texts),
                where('status', '==', 'published'),
                orderBy('updatedAt', 'desc'),
                limit(size),
              )
          const snap = await getDocs(q)
          if (!snap.empty) {
            delivered += snap.size
            await onPage(snap.docs.map((d) => d.data() as LearningText))
          }
          if (snap.size < size) break
          cursor = snap.docs[snap.docs.length - 1]
        }
        if (delivered > 0) return
      } catch {
        // The ordered page query can fail while the index builds. Fall through.
      }
      const all = await texts.listPublished()
      for (let index = 0; index < all.length; index += size) {
        await onPage(all.slice(index, index + size))
      }
    },
    async listUpdatedSince(updatedAfter) {
      const q = query(
        collection(db, COLLECTIONS.texts),
        where('status', '==', 'published'),
        where('updatedAt', '>', updatedAfter),
        orderBy('updatedAt', 'desc'),
      )
      const snap = await getDocs(q)
      return snap.docs.map((d) => d.data() as LearningText)
    },
    async getById(id) {
      const snap = await getDoc(doc(db, COLLECTIONS.texts, id))
      return snap.exists() ? (snap.data() as LearningText) : null
    },
    async findByTitleSubstring(queryStr) {
      const q = queryStr.trim()
      if (!q) return []
      return (await texts.listPublished()).filter((t) => includesIgnoreCase(t.title, q))
    },
    async findByWordId(wordId) {
      const q = query(
        collection(db, COLLECTIONS.texts),
        where('status', '==', 'published'),
        where('wordIds', 'array-contains', wordId),
      )
      const snap = await getDocs(q)
      return snap.docs.map((d) => d.data() as LearningText).filter((t) => t.status === 'published')
    },
    async findByConstructionId(constructionId) {
      const q = query(
        collection(db, COLLECTIONS.texts),
        where('status', '==', 'published'),
        where('constructionIds', 'array-contains', constructionId),
      )
      const snap = await getDocs(q)
      return snap.docs.map((d) => d.data() as LearningText).filter((t) => t.status === 'published')
    },
    async listByAuthor(authorId) {
      const q = query(collection(db, COLLECTIONS.texts), where('authorId', '==', authorId))
      const snap = await getDocs(q)
      return snap.docs
        .map((d) => d.data() as LearningText)
        .filter((t) => t.status !== 'deleted')
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    },
    async create(text) {
      await setDoc(doc(db, COLLECTIONS.texts, text.id), text)
      return text
    },
    async update(text) {
      const previousSnap = await getDoc(doc(db, COLLECTIONS.texts, text.id))
      const previous = previousSnap.exists() ? (previousSnap.data() as LearningText) : null
      const updated = { ...withOccurrenceWordIds(text), updatedAt: ts() }
      await setDoc(doc(db, COLLECTIONS.texts, text.id), updated)
      await syncWordsForText(words, previous, updated)
      return updated
    },
    async recordView(userId, textId) {
      const textRef = doc(db, COLLECTIONS.texts, textId)
      const snap = await getDoc(textRef)
      if (!snap.exists()) return null
      const text = snap.data() as LearningText
      if (text.status === 'draft') return text
      const viewRef = doc(db, COLLECTIONS.texts, textId, COLLECTIONS.textViews, userId)
      const seen = await getDoc(viewRef)
      if (seen.exists()) return text
      await setDoc(viewRef, { userId, textId, viewedAt: ts() })
      const updated = { ...text, views: text.views + 1, updatedAt: ts() }
      await setDoc(textRef, updated)
      return updated
    },
    async toggleLike(userId, textId) {
      return applyTextReaction(userId, textId, 'like')
    },
    async toggleDislike(userId, textId) {
      return applyTextReaction(userId, textId, 'dislike')
    },
    async isLiked(userId, textId) {
      const snap = await getDoc(doc(db, COLLECTIONS.texts, textId, COLLECTIONS.textLikes, userId))
      return snap.exists()
    },
    async isDisliked(userId, textId) {
      const snap = await getDoc(doc(db, COLLECTIONS.texts, textId, COLLECTIONS.textDislikes, userId))
      return snap.exists()
    },
    async toggleSaved(userId, textId) {
      const savedRef = doc(db, COLLECTIONS.users, userId, COLLECTIONS.savedTexts, textId)
      const existing = await getDoc(savedRef)
      if (existing.exists()) {
        await deleteDoc(savedRef)
        return false
      }
      await setDoc(savedRef, { textId, savedAt: ts() })
      return true
    },
    async isSaved(userId, textId) {
      const snap = await getDoc(doc(db, COLLECTIONS.users, userId, COLLECTIONS.savedTexts, textId))
      return snap.exists()
    },
    async listSaved(userId) {
      const snap = await getDocs(collection(db, COLLECTIONS.users, userId, COLLECTIONS.savedTexts))
      const texts = await Promise.all(snap.docs.map((item) => this.getById(item.id)))
      return texts
        .filter((text): text is LearningText => Boolean(text && text.status !== 'deleted'))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    },
    async listByStatus(status) {
      const q = query(collection(db, COLLECTIONS.texts), where('status', '==', status))
      const snap = await getDocs(q)
      return snap.docs.map((item) => item.data() as LearningText)
    },
    async syncPublicStats(textId) {
      return syncPublicStats(textId)
    },
  }

  async function syncPublicStats(textId: string): Promise<LearningText | null> {
    const textRef = doc(db, COLLECTIONS.texts, textId)
    const snap = await getDoc(textRef)
    if (!snap.exists()) return null
    const text = snap.data() as LearningText
    try {
      const commentsSnap = await getDocs(collection(db, COLLECTIONS.texts, textId, COLLECTIONS.comments))
      return applyCountedPublicStats(text, {
        views: text.views,
        likes: text.favoritesCount,
        dislikes: text.dislikesCount ?? 0,
        comments: commentsSnap.size,
      })
    } catch {
      return text
    }
  }

  async function applyTextReaction(userId: string, textId: string, pressed: 'like' | 'dislike') {
    const textRef = doc(db, COLLECTIONS.texts, textId)
    const snap = await getDoc(textRef)
    if (!snap.exists()) return null
    const text = snap.data() as LearningText
    const likeRef = doc(db, COLLECTIONS.texts, textId, COLLECTIONS.textLikes, userId)
    const dislikeRef = doc(db, COLLECTIONS.texts, textId, COLLECTIONS.textDislikes, userId)
    const [likeSnap, dislikeSnap] = await Promise.all([getDoc(likeRef), getDoc(dislikeRef)])
    const current = likeSnap.exists() ? 'like' : dislikeSnap.exists() ? 'dislike' : null
    const next = exclusiveReaction(text.favoritesCount, text.dislikesCount ?? 0, current, pressed)
    if (next.reaction === 'like') await setDoc(likeRef, { userId, textId, createdAt: ts() })
    else if (likeSnap.exists()) await deleteDoc(likeRef)
    if (next.reaction === 'dislike') await setDoc(dislikeRef, { userId, textId, createdAt: ts() })
    else if (dislikeSnap.exists()) await deleteDoc(dislikeRef)
    const updated = {
      ...text,
      favoritesCount: next.likes,
      dislikesCount: next.dislikes,
      updatedAt: ts(),
    }
    await setDoc(textRef, updated)
    return { text: updated, liked: next.reaction === 'like', disliked: next.reaction === 'dislike' }
  }

  const users: Repositories['users'] = {
    async getById(id) {
      const snap = await getDoc(doc(db, COLLECTIONS.users, id))
      return snap.exists() ? (snap.data() as User) : null
    },
    async upsert(user) {
      await setDoc(doc(db, COLLECTIONS.users, user.id), user, { merge: true })
    },
  }

  const progress: Repositories['progress'] = {
    async getWordProgress(userId, wordId) {
      const snap = await getDoc(
        doc(db, COLLECTIONS.users, userId, COLLECTIONS.wordProgress, wordId),
      )
      return snap.exists() ? (snap.data() as UserWordProgress) : null
    },
    async listWordProgress(userId) {
      const snap = await getDocs(collection(db, COLLECTIONS.users, userId, COLLECTIONS.wordProgress))
      return snap.docs.map((d) => d.data() as UserWordProgress)
    },
    async setWordLevel(userId, wordId, level) {
      const clamped = Math.min(5, Math.max(0, Math.round(level)))
      const entry: UserWordProgress = {
        userId,
        wordId,
        level: clamped,
        updatedAt: ts(),
      }
      await setDoc(doc(db, COLLECTIONS.users, userId, COLLECTIONS.wordProgress, wordId), entry)
      return entry
    },
    async getTextProgress(userId, textId) {
      const snap = await getDoc(
        doc(db, COLLECTIONS.users, userId, COLLECTIONS.textProgress, textId),
      )
      return snap.exists() ? (snap.data() as UserTextProgress) : null
    },
    async listTextProgress(userId) {
      const snap = await getDocs(collection(db, COLLECTIONS.users, userId, COLLECTIONS.textProgress))
      return snap.docs.map((d) => d.data() as UserTextProgress)
    },
    async upsertTextProgress(entry) {
      const stored = { ...entry, updatedAt: ts() }
      await setDoc(
        doc(db, COLLECTIONS.users, entry.userId, COLLECTIONS.textProgress, entry.textId),
        stored,
      )
    },
  }

  const topics: Repositories['topics'] = {
    async list() {
      const snap = await getDocs(collection(db, COLLECTIONS.topics))
      return snap.docs.map((d) => d.data() as Topic).sort((a, b) => a.name.localeCompare(b.name))
    },
    async getById(id) {
      const snap = await getDoc(doc(db, COLLECTIONS.topics, id))
      return snap.exists() ? (snap.data() as Topic) : null
    },
    async create(topic) {
      await setDoc(doc(db, COLLECTIONS.topics, topic.id), topic)
      return topic
    },
  }

  const series: Repositories['series'] = {
    async list() {
      const snap = await getDocs(collection(db, COLLECTIONS.textSeries))
      return snap.docs.map((d) => d.data() as TextSeries)
    },
    async listByAuthor(authorId) {
      try {
        const q = query(collection(db, COLLECTIONS.textSeries), where('authorId', '==', authorId))
        const snap = await getDocs(q)
        return snap.docs
          .map((d) => d.data() as TextSeries)
          .sort((a, b) => a.title.localeCompare(b.title))
      } catch {
        const all = await series.list()
        return all.filter((item) => item.authorId === authorId).sort((a, b) => a.title.localeCompare(b.title))
      }
    },
    async getById(id) {
      const snap = await getDoc(doc(db, COLLECTIONS.textSeries, id))
      return snap.exists() ? (snap.data() as TextSeries) : null
    },
    async create(item) {
      await setDoc(doc(db, COLLECTIONS.textSeries, item.id), item, { merge: true })
      return item
    },
    async update(item) {
      await setDoc(doc(db, COLLECTIONS.textSeries, item.id), item, { merge: true })
      return item
    },
    async remove(id) {
      await deleteDoc(doc(db, COLLECTIONS.textSeries, id))
    },
  }

  const reports: Repositories['reports'] = {
    async create(input) {
      const report: Report = {
        id: `report-${crypto.randomUUID()}`,
        ...input,
        createdAt: ts(),
      }
      await setDoc(doc(db, COLLECTIONS.reports, report.id), report)
      return report
    },
  }

  const translationVotes: Repositories['translationVotes'] = {
    async castVote(input) {
      const id = voteKey(input.userId, input.proposalId)
      const vote: TranslationVote = {
        id: `vote-${id}`,
        userId: input.userId,
        proposalId: input.proposalId,
        type: input.type,
        value: input.value,
        createdAt: ts(),
      }
      await setDoc(doc(db, COLLECTIONS.translationVotes, id), vote)
      return vote
    },
    async getUserVote(userId, proposalId) {
      const snap = await getDoc(doc(db, COLLECTIONS.translationVotes, voteKey(userId, proposalId)))
      return snap.exists() ? (snap.data() as TranslationVote) : null
    },
    async listForProposal(proposalId) {
      const q = query(collection(db, COLLECTIONS.translationVotes), where('proposalId', '==', proposalId))
      const snap = await getDocs(q)
      return snap.docs.map((d) => d.data() as TranslationVote)
    },
  }

  const textRatings: Repositories['textRatings'] = {
    async upsert(input) {
      const key = ratingKey(input.userId, input.textId)
      const ref = doc(db, COLLECTIONS.textRatings, key)
      const existing = await getDoc(ref)
      const rating: TextRating = {
        id: existing.exists() ? (existing.data() as TextRating).id : input.id ?? `rating-${key}`,
        textId: input.textId,
        userId: input.userId,
        usefulness: input.usefulness,
        interestingness: input.interestingness,
        uniqueness: input.uniqueness,
        learningValue: input.learningValue,
        createdAt: existing.exists() ? (existing.data() as TextRating).createdAt : ts(),
        updatedAt: ts(),
      }
      await setDoc(ref, rating)
      return rating
    },
    async getUserRating(userId, textId) {
      const snap = await getDoc(doc(db, COLLECTIONS.textRatings, ratingKey(userId, textId)))
      return snap.exists() ? (snap.data() as TextRating) : null
    },
    async listForText(textId) {
      const q = query(collection(db, COLLECTIONS.textRatings), where('textId', '==', textId))
      const snap = await getDocs(q)
      return snap.docs.map((d) => d.data() as TextRating)
    },
  }

  const wordTextHistory: Repositories['wordTextHistory'] = {
    async record(entry) {
      const key = historyKey(entry.userId, entry.wordId, entry.textId)
      const stored: UserWordTextHistory = { ...entry, learnedAt: entry.learnedAt ?? ts() }
      await setDoc(
        doc(db, COLLECTIONS.users, entry.userId, COLLECTIONS.wordTextHistory, key),
        stored,
      )
      return stored
    },
    async listForUser(userId) {
      const snap = await getDocs(
        collection(db, COLLECTIONS.users, userId, COLLECTIONS.wordTextHistory),
      )
      return snap.docs.map((d) => d.data() as UserWordTextHistory)
    },
    async countDistinctTexts(userId, wordId) {
      const snap = await getDocs(
        collection(db, COLLECTIONS.users, userId, COLLECTIONS.wordTextHistory),
      )
      const textIds = new Set<string>()
      for (const d of snap.docs) {
        const h = d.data() as UserWordTextHistory
        if (h.wordId === wordId) textIds.add(h.textId)
      }
      return textIds.size
    },
    async listForWord(userId, wordId) {
      const snap = await getDocs(
        collection(db, COLLECTIONS.users, userId, COLLECTIONS.wordTextHistory),
      )
      return snap.docs
        .map((d) => d.data() as UserWordTextHistory)
        .filter((h) => h.wordId === wordId)
    },
    async clearForWord(userId, wordId) {
      const snap = await getDocs(
        collection(db, COLLECTIONS.users, userId, COLLECTIONS.wordTextHistory),
      )
      await Promise.all(
        snap.docs
          .filter((d) => (d.data() as UserWordTextHistory).wordId === wordId)
          .map((d) => deleteDoc(d.ref)),
      )
    },
  }

  const wordEdits: Repositories['wordEdits'] = {
    async getById(id) {
      const snap = await getDoc(doc(db, COLLECTIONS.wordEdits, id))
      return snap.exists() ? (snap.data() as WordEdit) : null
    },
    async listForWord(wordId) {
      const snap = await getDocs(
        query(collection(db, COLLECTIONS.wordEdits), where('wordId', '==', wordId)),
      )
      return snap.docs.map((item) => item.data() as WordEdit)
    },
    async listVotes(editId) {
      const snap = await getDocs(
        query(collection(db, COLLECTIONS.wordEditVotes), where('editId', '==', editId)),
      )
      return snap.docs.map((item) => item.data() as WordEditVote)
    },
    async save(edit) {
      await setDoc(doc(db, COLLECTIONS.wordEdits, edit.id), edit)
      return edit
    },
    async saveVote(vote) {
      await setDoc(doc(db, COLLECTIONS.wordEditVotes, vote.id), vote)
      return vote
    },
    async listBans(userId) {
      const snap = await getDocs(
        query(collection(db, COLLECTIONS.editBans), where('userId', '==', userId)),
      )
      return snap.docs.map((item) => item.data() as EditBan)
    },
    async saveBan(ban) {
      await setDoc(doc(db, COLLECTIONS.editBans, ban.id), ban)
      return ban
    },
  }

  const comments: Repositories['comments'] = {
    async listForText(textId) {
      const snap = await getDocs(collection(db, COLLECTIONS.texts, textId, COLLECTIONS.comments))
      return snap.docs
        .map((item) => item.data() as TextComment)
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
      await setDoc(doc(db, COLLECTIONS.texts, input.textId, COLLECTIONS.comments, comment.id), comment)
      const textRef = doc(db, COLLECTIONS.texts, input.textId)
      const textSnap = await getDoc(textRef)
      if (textSnap.exists()) {
        const text = textSnap.data() as LearningText
        const commentsSnap = await getDocs(collection(db, COLLECTIONS.texts, input.textId, COLLECTIONS.comments))
        await setDoc(textRef, {
          ...text,
          commentsCount: commentsSnap.size,
          updatedAt: ts(),
        })
      }
      return comment
    },
    async toggleReaction(userId, textId, commentId, reaction) {
      const commentRef = doc(db, COLLECTIONS.texts, textId, COLLECTIONS.comments, commentId)
      const snap = await getDoc(commentRef)
      if (!snap.exists()) return null
      const comment = snap.data() as TextComment
      const reactionRef = doc(
        db,
        COLLECTIONS.texts,
        textId,
        COLLECTIONS.commentReactions,
        `${userId}__${commentId}`,
      )
      const reactionSnap = await getDoc(reactionRef)
      const current = reactionSnap.exists()
        ? (reactionSnap.data().type as 'like' | 'dislike')
        : null
      const next = exclusiveReaction(comment.likesCount, comment.dislikesCount, current, reaction)
      if (next.reaction) {
        await setDoc(reactionRef, { userId, textId, commentId, type: next.reaction })
      } else if (reactionSnap.exists()) {
        await deleteDoc(reactionRef)
      }
      const updated = { ...comment, likesCount: next.likes, dislikesCount: next.dislikes }
      await setDoc(commentRef, updated)
      return updated
    },
    async reactionsFor(userId, textId) {
      const snap = await getDocs(
        query(
          collection(db, COLLECTIONS.texts, textId, COLLECTIONS.commentReactions),
          where('userId', '==', userId),
        ),
      )
      const reactions: Record<string, 'like' | 'dislike'> = {}
      for (const item of snap.docs) {
        const data = item.data() as { commentId: string; type: 'like' | 'dislike' }
        reactions[data.commentId] = data.type
      }
      return reactions
    },
  }

  const notifications: Repositories['notifications'] = {
    async list(userId) {
      const snap = await getDocs(collection(db, COLLECTIONS.users, userId, COLLECTIONS.notifications))
      return snap.docs
        .map((item) => item.data() as UserNotification)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    },
    async add(notification) {
      await setDoc(
        doc(db, COLLECTIONS.users, notification.userId, COLLECTIONS.notifications, notification.id),
        notification,
      )
    },
    async markRead(userId, notificationId) {
      const ref = doc(db, COLLECTIONS.users, userId, COLLECTIONS.notifications, notificationId)
      const snap = await getDoc(ref)
      if (!snap.exists()) return
      const stored = snap.data() as UserNotification
      if (stored.read) return
      await setDoc(ref, { ...stored, read: true })
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
