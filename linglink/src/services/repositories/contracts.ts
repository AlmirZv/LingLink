import type {
  GrammarConstruction,
  ID,
  LanguageCode,
  LearningText,
  EditBan,
  Report,
  ReportTargetType,
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
  UserNotification,
} from '@/types/db'

export interface WordRepository {
  getById(id: ID): Promise<Word | null>
  listByIds(ids: ID[]): Promise<Word[]>
  listAll(): Promise<Word[]>
  /** Words changed after an ISO timestamp. Used to refresh the on-device dictionary. */
  listUpdatedSince(updatedAfter: string): Promise<Word[]>
  findByWordSubstring(query: string, language?: LanguageCode): Promise<Word[]>
  create(word: Word): Promise<Word>
  update(word: Word): Promise<Word>
}

export interface GrammarConstructionRepository {
  getById(id: ID): Promise<GrammarConstruction | null>
  findBySubstring(query: string, language?: LanguageCode): Promise<GrammarConstruction[]>
  create(construction: GrammarConstruction): Promise<GrammarConstruction>
  update(construction: GrammarConstruction): Promise<GrammarConstruction>
}

export interface TextRepository {
  listPublished(): Promise<LearningText[]>
  /** Published texts in pages, so the library can appear before the whole catalog is downloaded. */
  forEachPublishedPage(pageSize: number, onPage: (page: LearningText[]) => Promise<void> | void): Promise<void>
  /** Texts changed after an ISO timestamp, including ones that are no longer published. */
  listUpdatedSince(updatedAfter: string): Promise<LearningText[]>
  listByAuthor(authorId: ID): Promise<LearningText[]>
  getById(id: ID): Promise<LearningText | null>
  findByTitleSubstring(query: string): Promise<LearningText[]>
  findByWordId(wordId: ID): Promise<LearningText[]>
  findByConstructionId(constructionId: ID): Promise<LearningText[]>
  create(text: LearningText): Promise<LearningText>
  update(text: LearningText): Promise<LearningText>
  /** Counts this user once. Returns the text with the stored view total. */
  recordView(userId: ID, textId: ID): Promise<LearningText | null>
  toggleLike(userId: ID, textId: ID): Promise<{ text: LearningText; liked: boolean; disliked: boolean } | null>
  toggleDislike(userId: ID, textId: ID): Promise<{ text: LearningText; liked: boolean; disliked: boolean } | null>
  isLiked(userId: ID, textId: ID): Promise<boolean>
  isDisliked(userId: ID, textId: ID): Promise<boolean>
  toggleSaved(userId: ID, textId: ID): Promise<boolean>
  isSaved(userId: ID, textId: ID): Promise<boolean>
  listSaved(userId: ID): Promise<LearningText[]>
  listByStatus(status: LearningText['status']): Promise<LearningText[]>
  /** Recounts views, likes, dislikes, and comments from subcollections and heals stored totals. */
  syncPublicStats(textId: ID): Promise<LearningText | null>
}

export interface NotificationRepository {
  list(userId: ID): Promise<UserNotification[]>
  add(notification: UserNotification): Promise<void>
  markRead(userId: ID, notificationId: ID): Promise<void>
}

export interface CommentRepository {
  listForText(textId: ID): Promise<TextComment[]>
  add(input: {
    textId: ID
    authorId: ID
    body: string
    parentId: ID | null
    replyToAuthorId?: ID
  }): Promise<TextComment>
  toggleReaction(
    userId: ID,
    textId: ID,
    commentId: ID,
    reaction: 'like' | 'dislike',
  ): Promise<TextComment | null>
  reactionsFor(userId: ID, textId: ID): Promise<Record<ID, 'like' | 'dislike'>>
}

export interface UserRepository {
  getById(id: ID): Promise<User | null>
  upsert(user: User): Promise<void>
}

export interface ProgressRepository {
  getWordProgress(userId: ID, wordId: ID): Promise<UserWordProgress | null>
  listWordProgress(userId: ID): Promise<UserWordProgress[]>
  setWordLevel(userId: ID, wordId: ID, level: number): Promise<UserWordProgress>
  getTextProgress(userId: ID, textId: ID): Promise<UserTextProgress | null>
  listTextProgress(userId: ID): Promise<UserTextProgress[]>
  upsertTextProgress(progress: UserTextProgress): Promise<void>
}

export interface TopicRepository {
  list(): Promise<Topic[]>
  getById(id: ID): Promise<Topic | null>
  create(topic: Topic): Promise<Topic>
}

export interface SeriesRepository {
  list(): Promise<TextSeries[]>
  listByAuthor(authorId: ID): Promise<TextSeries[]>
  getById(id: ID): Promise<TextSeries | null>
  create(series: TextSeries): Promise<TextSeries>
  update(series: TextSeries): Promise<TextSeries>
  remove(id: ID): Promise<void>
}

export interface ReportRepository {
  create(input: {
    targetType: ReportTargetType
    targetId: ID
    userId: ID
    reason: string
  }): Promise<Report>
}

export interface TranslationVoteRepository {
  castVote(input: {
    userId: ID
    proposalId: ID
    type: TranslationVote['type']
    value: 1 | -1
  }): Promise<TranslationVote>
  getUserVote(userId: ID, proposalId: ID): Promise<TranslationVote | null>
  listForProposal(proposalId: ID): Promise<TranslationVote[]>
}

export interface TextRatingRepository {
  upsert(rating: Omit<TextRating, 'id' | 'createdAt' | 'updatedAt'> & { id?: ID }): Promise<TextRating>
  getUserRating(userId: ID, textId: ID): Promise<TextRating | null>
  listForText(textId: ID): Promise<TextRating[]>
}

export interface WordEditRepository {
  getById(id: ID): Promise<WordEdit | null>
  listForWord(wordId: ID): Promise<WordEdit[]>
  listVotes(editId: ID): Promise<WordEditVote[]>
  save(edit: WordEdit): Promise<WordEdit>
  saveVote(vote: WordEditVote): Promise<WordEditVote>
  listBans(userId: ID): Promise<EditBan[]>
  saveBan(ban: EditBan): Promise<EditBan>
}

export interface UserWordTextHistoryRepository {
  record(entry: UserWordTextHistory): Promise<UserWordTextHistory>
  listForUser(userId: ID): Promise<UserWordTextHistory[]>
  countDistinctTexts(userId: ID, wordId: ID): Promise<number>
  listForWord(userId: ID, wordId: ID): Promise<UserWordTextHistory[]>
  clearForWord(userId: ID, wordId: ID): Promise<void>
}

export interface Repositories {
  words: WordRepository
  constructions: GrammarConstructionRepository
  texts: TextRepository
  users: UserRepository
  progress: ProgressRepository
  topics: TopicRepository
  series: SeriesRepository
  reports: ReportRepository
  translationVotes: TranslationVoteRepository
  textRatings: TextRatingRepository
  wordTextHistory: UserWordTextHistoryRepository
  wordEdits: WordEditRepository
  comments: CommentRepository
  notifications: NotificationRepository
}
