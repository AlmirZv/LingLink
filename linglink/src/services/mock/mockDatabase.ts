import type {
  GrammarConstruction,
  ID,
  LearningText,
  EditBan,
  Report,
  TextRating,
  TextComment,
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
  UserNotification,
} from '@/types/db'

import {
  mergeDuplicateWords,
  remapConstruction,
  remapLearningText,
  remapTextProgress,
  remapWordHistory,
  remapWordProgress,
} from '@/domain/words/mergeDuplicateWords'
import { indexTextsOntoWords, sameAppearances } from '@/domain/words/textAppearances'
import { buildSeedCatalog } from './seed'
import { loadPersistedCatalog, savePersistedCatalog } from './persistCatalog'
import {
  loadPersistedCommunity,
  savePersistedCommunity,
  ratingKey,
  voteKey,
} from './persistCommunity'
import {
  historyKey,
  loadPersistedProgress,
  savePersistedProgress,
  splitUserTextKey,
  textProgressKey,
  wordProgressKey,
} from './persistProgress'
import {
  commentReactionKey,
  loadPersistedSocial,
  savePersistedSocial,
  type PersistedCommentReaction,
} from './persistSocial'

export class MockDatabase {
  words = new Map<ID, Word>()
  constructions = new Map<ID, GrammarConstruction>()
  topics = new Map<ID, Topic>()
  texts = new Map<ID, LearningText>()
  series = new Map<ID, TextSeries>()
  users = new Map<ID, User>()
  wordProgress = new Map<string, UserWordProgress>()
  textProgress = new Map<string, UserTextProgress>()
  wordTextHistory = new Map<string, UserWordTextHistory>()
  textViews = new Set<string>()
  textLikes = new Set<string>()
  textDislikes = new Set<string>()
  textSaves = new Set<string>()
  comments: TextComment[] = []
  commentReactions = new Map<string, PersistedCommentReaction>()
  reports: Report[] = []
  translationVotes = new Map<string, TranslationVote>()
  textRatings = new Map<string, TextRating>()
  wordEdits: WordEdit[] = []
  wordEditVotes = new Map<string, WordEditVote>()
  editBans: EditBan[] = []
  notifications = new Map<ID, UserNotification>()
  private wordIdRemap = new Map<ID, ID>()

  constructor() {
    this.loadSeed()
    this.mergePersistedProgress()
    this.mergePersistedSocial()
  }

  private loadSeed(): void {
    const seed = buildSeedCatalog()
    for (const w of seed.words) this.words.set(w.id, w)
    for (const c of seed.constructions) this.constructions.set(c.id, c)
    for (const t of seed.topics) this.topics.set(t.id, t)
    for (const text of seed.texts) this.texts.set(text.id, text)
    for (const u of seed.users) this.users.set(u.id, u)
    for (const p of seed.wordProgress) {
      this.wordProgress.set(wordProgressKey(p.userId, p.wordId), p)
    }
    for (const p of seed.textProgress) {
      this.textProgress.set(textProgressKey(p.userId, p.textId), p)
    }

    const custom = loadPersistedCatalog()
    for (const w of custom.words) this.words.set(w.id, w)
    for (const topic of custom.topics) this.topics.set(topic.id, topic)
    for (const construction of custom.constructions) this.constructions.set(construction.id, construction)
    for (const text of custom.texts) this.texts.set(text.id, text)
    for (const series of custom.series) this.series.set(series.id, series)

    const community = loadPersistedCommunity()
    for (const v of community.translationVotes) {
      this.translationVotes.set(voteKey(v.userId, v.proposalId), v)
    }
    for (const r of community.textRatings) {
      this.textRatings.set(ratingKey(r.userId, r.textId), r)
    }
    this.reports.push(...community.reports)
    this.wordEdits.push(...community.wordEdits)
    for (const vote of community.wordEditVotes) {
      this.wordEditVotes.set(`${vote.userId}::${vote.editId}`, vote)
    }
    this.editBans.push(...community.editBans)
    for (const notice of community.notifications) this.notifications.set(notice.id, notice)
    this.collapseDuplicateWords()
    this.indexWordAppearances()
  }

  /** Fill stored text lists for texts that were published before this index existed. */
  private indexWordAppearances(): void {
    const next = indexTextsOntoWords([...this.words.values()], [...this.texts.values()])
    let changed = false
    for (const word of next) {
      const current = this.words.get(word.id)
      if (!current || sameAppearances(current.textAppearances, word.textAppearances)) continue
      this.words.set(word.id, word)
      changed = true
    }
    if (changed) this.persistCatalog()
  }

  private collapseDuplicateWords(): void {
    const { words, remap } = mergeDuplicateWords([...this.words.values()])
    this.wordIdRemap = remap
    if (remap.size === 0) return
    this.words = new Map(words.map((word) => [word.id, word]))
    this.texts = new Map(
      [...this.texts.values()].map((text) => {
        const next = remapLearningText(text, remap)
        return [next.id, next] as const
      }),
    )
    this.constructions = new Map(
      [...this.constructions.values()].map((construction) => {
        const next = remapConstruction(construction, remap)
        return [next.id, next] as const
      }),
    )
    const progress = remapWordProgress([...this.wordProgress.values()], remap)
    this.wordProgress = new Map(progress.map((row) => [wordProgressKey(row.userId, row.wordId), row]))
    const textProgress = remapTextProgress([...this.textProgress.values()], remap)
    this.textProgress = new Map(textProgress.map((row) => [textProgressKey(row.userId, row.textId), row]))
    this.persistCatalog()
  }

  persistCatalog(): void {
    savePersistedCatalog(
      [...this.texts.values()],
      [...this.words.values()],
      [...this.topics.values()],
      [...this.constructions.values()],
      [...this.series.values()],
    )
  }

  private mergePersistedProgress(): void {
    const persisted = loadPersistedProgress()
    if (!persisted) return
    for (const p of persisted.wordProgress) {
      this.wordProgress.set(wordProgressKey(p.userId, p.wordId), p)
    }
    for (const p of persisted.textProgress) {
      this.textProgress.set(textProgressKey(p.userId, p.textId), p)
    }
    for (const h of remapWordHistory(persisted.wordTextHistory, this.wordIdRemap)) {
      this.wordTextHistory.set(historyKey(h.userId, h.wordId, h.textId), h)
    }
    for (const mark of persisted.textViews ?? []) {
      this.textViews.add(textProgressKey(mark.userId, mark.textId))
    }
    for (const mark of persisted.textLikes ?? []) {
      this.textLikes.add(textProgressKey(mark.userId, mark.textId))
    }
    for (const mark of persisted.textDislikes ?? []) {
      this.textDislikes.add(textProgressKey(mark.userId, mark.textId))
    }
    for (const mark of persisted.textSaves ?? []) {
      this.textSaves.add(textProgressKey(mark.userId, mark.textId))
    }
    if (this.wordIdRemap.size > 0) {
      const progress = remapWordProgress([...this.wordProgress.values()], this.wordIdRemap)
      this.wordProgress = new Map(progress.map((row) => [wordProgressKey(row.userId, row.wordId), row]))
      const textProgress = remapTextProgress([...this.textProgress.values()], this.wordIdRemap)
      this.textProgress = new Map(
        textProgress.map((row) => [textProgressKey(row.userId, row.textId), row]),
      )
      this.persistUserData()
    }
  }

  persistUserData(): void {
    savePersistedProgress({
      wordProgress: [...this.wordProgress.values()],
      textProgress: [...this.textProgress.values()],
      wordTextHistory: [...this.wordTextHistory.values()],
      textViews: [...this.textViews].map(splitUserTextKey),
      textLikes: [...this.textLikes].map(splitUserTextKey),
      textDislikes: [...this.textDislikes].map(splitUserTextKey),
      textSaves: [...this.textSaves].map(splitUserTextKey),
    })
  }

  private mergePersistedSocial(): void {
    const social = loadPersistedSocial()
    this.comments = social.comments
    this.commentReactions = new Map(
      social.commentReactions.map((reaction) => [
        commentReactionKey(reaction.userId, reaction.commentId),
        reaction,
      ]),
    )
  }

  persistSocial(): void {
    savePersistedSocial({
      comments: this.comments,
      commentReactions: [...this.commentReactions.values()],
    })
  }

  persistCommunity(): void {
    savePersistedCommunity({
      translationVotes: [...this.translationVotes.values()],
      textRatings: [...this.textRatings.values()],
      reports: [...this.reports],
      wordEdits: this.wordEdits,
      wordEditVotes: [...this.wordEditVotes.values()],
      editBans: this.editBans,
      notifications: [...this.notifications.values()],
    })
  }
}
