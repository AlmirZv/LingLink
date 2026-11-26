// ============================================================
// LingLink — Database Types
// ============================================================

// ============================================================
// COMMON
// ============================================================

export type ID = string;

export type LanguageCode = string;
// Examples: "ru", "en", "ja", "zh", "ko"

export type Timestamp = unknown;
// Replace with FirebaseFirestore.Timestamp
// or firebase/firestore Timestamp in the actual project.

// ============================================================
// WORD
// ============================================================

export interface Word {
  id: ID;

  /**
   * Language of the word.
   */
  language: LanguageCode;

  /**
   * Written form used in texts and as the headword.
   *
   * Example:
   * "пошел"
   * "went"
   * "行く"
   * "行った"
   */
  word: string;

  /**
   * Ideographs in this word (kanji, hanzi).
   * Omitted when the word has no character spelling (パン, русский, went).
   *
   * Example:
   * "行" for 行く
   * "昨日" for 昨日
   * "狗" for Chinese 狗
   */
  character?: string;

  /**
   * Reading of the written form, for languages that use characters.
   * Japanese: furigana in hiragana. Chinese: pinyin.
   *
   * Example:
   * "いく" for 行く
   * "きのう" for 昨日
   * "gǒu" for 狗
   */
  furigana?: string;

  /**
   * Other character spellings people have added.
   * The live spelling stays in `character`.
   * Omitted until the word has a character spelling or someone adds one.
   */
  characterVariants?: WordReadingVariant[];

  /**
   * Other readings people have added.
   * The live reading stays in `furigana`.
   */
  furiganaVariants?: WordReadingVariant[];

  /**
   * Lookup of this exact surface in the Multilingual Dictionary
   * (dictionary.piether.com).
   *
   * Omitted when LingLink has not asked the dictionary about this word.
   * "found" — the word was stored from a dictionary entry.
   * "missing" — the dictionary answered with no translations.
   * A later scan must not call the dictionary for this surface again.
   */
  multilingualDictionary?: "found" | "missing";

  /**
   * Possible translations of this word.
   *
   * Key = target language
   * Value = IDs of Word entities.
   *
   * Example:
   *
   * {
   *   en: ["123"],
   *   ja: ["1234", "1324"]
   * }
   */
  translations: Record<LanguageCode, ID[]>;

  /**
   * Word type.
   */
  type: WordType;

  /**
   * IDs of words with the same root.
   *
   * IMPORTANT:
   * These are strictly same-root words,
   * not just semantically related words.
   */
  rootWords: ID[];

  /**
   * Grammar constructions in which
   * this word can be used.
   */
  grammarConstructions: ID[];

  /**
   * Texts this word occurs in.
   * Omitted until a published text that contains the word is saved.
   */
  textAppearances?: WordTextAppearance[];

  /**
   * Published texts that select this word as a translation.
   * Omitted until the count has been stored.
   */
  translationUseCount?: number;

  createdBy: ID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * A text this word occurs in.
 * Written when the text is published or later edited.
 * `readable` is false when the author hides or deletes the text.
 */
export interface WordTextAppearance {
  textId: ID;
  /** How many times the word occurs in that text. */
  count: number;
  /** The text is published: the author has not hidden or deleted it. */
  readable: boolean;
}

/** One kanji spelling or one reading that can be liked and disliked. */
export interface WordReadingVariant {
  id: ID;
  text: string;
  createdBy?: ID;
  /** Dictionary spellings are shown, but not voted on. */
  dictionary?: boolean;
}

export type WordType =
  | "noun"
  | "verb"
  | "adjective"
  | "adverb"
  | "pronoun"
  | "particle"
  | "conjunction"
  | "preposition"
  | "numeral"
  | "interjection"
  | "other";

// ============================================================
// GRAMMAR CONSTRUCTION
// ============================================================

export interface GrammarConstruction {
  id: ID;

  /**
   * Language of the construction.
   *
   * Example:
   * "ja"
   */
  language: LanguageCode;

  /**
   * Construction itself.
   *
   * Example:
   * "気をつけて"
   */
  construction: string;

  /**
   * Reading of the construction, for languages that use characters.
   * Japanese: furigana in hiragana. Chinese: pinyin.
   *
   * Example: "きをつけて" for 気をつけて
   */
  furigana?: string;

  /**
   * Surface forms that may appear in texts
   * (conjugations, variants).
   *
   * Example: 気をつける → 気をつけて, 気をつけた
   */
  forms: string[];

  /**
   * Possible translations.
   *
   * Key = target language
   * Value = IDs of corresponding Word entities.
   */
  translations: Record<LanguageCode, ID[]>;

  /**
   * Type of construction.
   */
  type: GrammarConstructionType;

  /**
   * Ordered ids of the words that form this construction.
   * The phrase is this sequence, shown as one shared translation.
   */
  wordIds?: ID[];

  /**
   * Words related to this construction.
   *
   * Example:
   *
   * 気をつけて
   * → осторожность
   *
   * These are NOT necessarily same-root words.
   */
  relatedWords: ID[];

  createdBy: ID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type GrammarConstructionType =
  | "expression"
  | "grammar"
  | "idiom"
  | "collocation"
  | "other";

// ============================================================
// TOPIC
// ============================================================

export interface Topic {
  id: ID;

  /**
   * Topic name.
   *
   * Example:
   * "Путешествия"
   * "Работа"
   * "Животные"
   */
  name: string;

  /**
   * Language of the topic name.
   */
  language: LanguageCode;

  createdBy: ID;
  createdAt: Timestamp;
}

// ============================================================
// TEXT
// ============================================================

export interface LearningText {
  id: ID;

  /**
   * Text title.
   */
  title: string;

  /**
   * Original text language (author's source).
   * Reading UX: forward if this matches user's L_known; reverse scaffold if this is L_learn
   * and `finalTranslations[L_known]` exists — see docs/product-language-model.md.
   */
  language: LanguageCode;

  /**
   * User who originally created the text.
   */
  authorId: ID;

  /**
   * Users who made significant contributions
   * to the text.
   */
  coAuthorIds: ID[];

  /**
   * Image associated with the text.
   */
  imageUrl?: string;

  /**
   * Topics of the text.
   */
  topics: ID[];

  /**
   * Universal difficulty (not JLPT/CEFR-specific).
   */
  level: TextLevel;

  /**
   * Optional link to a multi-chapter series.
   */
  seriesId?: ID;

  /**
   * Order within the series (0-based).
   */
  seriesPosition?: number;

  /**
   * Denormalized for search/filter (unique Word IDs in text).
   */
  wordIds: ID[];

  /**
   * Denormalized for search/filter (GrammarConstruction IDs).
   */
  constructionIds: ID[];

  /**
   * Original text split into sentences.
   */
  sentences: TextSentence[];

  /**
   * Natural/final translations of the text
   * into different languages.
   *
   * Example:
   *
   * {
   *   ja: {...},
   *   en: {...}
   * }
   */
  finalTranslations: Record<LanguageCode, FinalTranslation>;

  /**
   * Percentage of the text that has been
   * prepared with word/construction translations.
   *
   * 0.0 - 1.0
   */
  translationProgress: number;

  /**
   * Number of unique words in the text.
   */
  uniqueWordCount: number;

  /**
   * Number of sentences.
   */
  sentenceCount: number;

  /**
   * Text status.
   */
  status: TextStatus;

  /**
   * User ratings.
   */
  ratings: TextRatings;

  /**
   * Number of times the text was opened/read.
   */
  views: number;

  /**
   * Number of users who added the text
   * to favorites.
   */
  favoritesCount: number;

  /**
   * Number of users who disliked the text.
   * Absent on older rows; readers treat that as zero.
   */
  dislikesCount?: number;

  /**
   * Saved translation edits. Absent on older rows; the reader falls back to the stored proposals.
   */
  editCount?: number;

  /**
   * Comments on the text. Absent on older rows; readers count the comments subcollection.
   */
  commentsCount?: number;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type TextStatus = "draft" | "published" | "hidden" | "deleted";

/**
 * A comment on a text. Replies use parentId of the root comment
 * and stay one level deep, the way a feed thread does.
 */
export interface TextComment {
  id: ID;
  textId: ID;
  authorId: ID;
  body: string;
  parentId: ID | null;
  replyToAuthorId?: ID;
  likesCount: number;
  dislikesCount: number;
  createdAt: Timestamp;
}

export type TextLevel =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "native";

// ============================================================
// SENTENCE
// ============================================================

export interface TextSentence {
  /**
   * Unique ID of the sentence
   * inside the text.
   */
  id: ID;

  /**
   * Sentence order in the text.
   */
  position: number;

  /**
   * Original sentence.
   */
  text: string;

  /**
   * Words in their original order.
   */
  words: TextWordOccurrence[];

  /**
   * Grammar constructions found
   * in this sentence.
   */
  constructions: TextConstructionOccurrence[];

  /**
   * Full-sentence translation proposals, keyed by target language.
   * Each entry keeps the author, the text, and who liked it.
   */
  finalProposals?: Record<LanguageCode, FinalTranslationProposal[]>;
}

// ============================================================
// WORD OCCURRENCE
// ============================================================

export interface TextWordOccurrence {
  /**
   * Stable ID for this occurrence (used in FinalTranslation mapping).
   */
  id: ID;

  /**
   * Parent sentence ID.
   */
  sentenceId: ID;

  /**
   * Position of the word inside
   * the sentence.
   */
  position: number;

  /**
   * Global Word ID.
   *
   * Optional because the word may not
   * exist in the database yet.
   */
  wordId?: ID;

  /**
   * Actual word as it appears
   * in this sentence.
   *
   * Example:
   * "пошел"
   */
  text: string;

  /**
   * Number of occurrences of this word
   * throughout the entire text.
   */
  occurrenceCount: number;

  /**
   * Translation proposals for THIS
   * particular usage of the word.
   */
  translations: WordTranslationProposal[];

  /**
   * Currently selected / most popular
   * translation proposal.
   */
  selectedTranslationId?: ID;
}

// ============================================================
// WORD TRANSLATION PROPOSAL
// ============================================================

export interface WordTranslationProposal {
  id: ID;

  /**
   * ID of the translated Word entity.
   */
  translationWordId: ID;

  /**
   * User who proposed the translation.
   */
  addedBy: ID;

  /**
   * When the proposal was added.
   */
  addedAt: Timestamp;

  /**
   * Community votes.
   */
  votes: TranslationVotes;
}

// ============================================================
// GRAMMAR CONSTRUCTION OCCURRENCE
// ============================================================

export interface TextConstructionOccurrence {
  /**
   * Starting position in the sentence.
   */
  startPosition: number;

  /**
   * Ending position in the sentence.
   */
  endPosition: number;

  /**
   * Global GrammarConstruction ID.
   */
  constructionId: ID;

  /**
   * Actual construction as it appears
   * in this sentence.
   */
  text: string;

  /**
   * Translation proposals for this
   * particular occurrence.
   */
  translations: ConstructionTranslationProposal[];

  /**
   * Currently selected / most popular
   * translation.
   */
  selectedTranslationId?: ID;
}

// ============================================================
// CONSTRUCTION TRANSLATION PROPOSAL
// ============================================================

export interface ConstructionTranslationProposal {
  id: ID;

  /**
   * ID of the translation.
   *
   * Usually points to a Word entity.
   */
  translationId: ID;

  /**
   * User who proposed the translation.
   */
  addedBy: ID;

  /**
   * When the proposal was added.
   */
  addedAt: Timestamp;

  /**
   * Community votes.
   */
  votes: TranslationVotes;
}

// ============================================================
// VOTES
// ============================================================

export interface TranslationVotes {
  up: number;
  down: number;
}

// ============================================================
// FINAL / NATURAL TRANSLATION
// ============================================================

export interface FinalTranslation {
  /**
   * Complete natural translation.
   *
   * Example:
   *
   * "昨日、店に行ってパンを買いました。"
   */
  text: string;

  /**
   * Words appearing in the final translation.
   */
  words: FinalTranslationWord[];

  /**
   * User who created this translation.
   */
  addedBy: ID;

  /**
   * Creation date.
   */
  addedAt: Timestamp;

  /**
   * Alternative versions proposed
   * by other users.
   */
  alternatives: FinalTranslationAlternative[];

  /**
   * Full-text proposals. The displayed `text` is the
   * proposal with the most likes.
   */
  proposals?: FinalTranslationProposal[];
}

export interface FinalTranslationProposal {
  id: ID;
  text: string;
  addedBy: ID;
  addedAt: Timestamp;
  likedBy: ID[];
  /** Original sentence this full-sentence proposal belongs to. */
  sentenceId?: ID;
}

// ============================================================
// WORD IN FINAL TRANSLATION
// ============================================================

export interface FinalTranslationWord {
  /**
   * Global Word ID.
   *
   * Optional because this word may not
   * exist in the database yet.
   */
  wordId?: ID;

  /**
   * Actual word in the final translation.
   */
  text: string;

  /**
   * IDs of concrete word occurrences
   * in the original text that this word
   * corresponds to.
   *
   * Empty array means this word exists
   * only in the natural translation.
   */
  sourceOccurrenceIds: ID[];
}

// ============================================================
// FINAL TRANSLATION ALTERNATIVE
// ============================================================

export interface FinalTranslationAlternative {
  id: ID;

  /**
   * Alternative natural translation.
   */
  text: string;

  /**
   * User who proposed it.
   */
  addedBy: ID;

  addedAt: Timestamp;

  votes: TranslationVotes;
}

// ============================================================
// TEXT RATINGS
// ============================================================

export interface TextRatings {
  /**
   * How useful the text is
   * for language learning.
   */
  usefulness: RatingSummary;

  /**
   * How interesting the text is.
   */
  interestingness: RatingSummary;

  /**
   * How unique/unusual the text is.
   */
  uniqueness: RatingSummary;

  /**
   * How suitable the text is
   * specifically for learning.
   */
  learningValue: RatingSummary;

  /**
   * Total number of ratings.
   */
  totalVotes: number;
}

export interface RatingSummary {
  /**
   * Average rating from 1 to 5.
   */
  average: number;

  /**
   * Number of ratings.
   */
  count: number;
}

// ============================================================
// USER
// ============================================================

export interface User {
  id: ID;

  displayName: string;

  photoUrl?: string;

  /**
   * Interface language.
   */
  interfaceLanguage: LanguageCode;

  /**
   * Languages the user is learning.
   */
  learningLanguages: LanguageCode[];

  /**
   * Languages the user knows.
   */
  knownLanguages: LanguageCode[];

  createdAt: Timestamp;
}

// ============================================================
// USER WORD PROGRESS
// ============================================================

export interface UserWordProgress {
  userId: ID;

  wordId: ID;

  /**
   * Mastery scale 0–5.
   *
   * MVP uses only 0 (unknown) and 1 (knows).
   * Levels 2–5 increase after the word is learned in
   * distinct texts (see UserWordTextHistory), not repeats
   * in one text.
   */
  level: number;

  updatedAt: Timestamp;
}

// ============================================================
// USER TEXT PROGRESS
// ============================================================

export interface UserTextProgress {
  userId: ID;

  textId: ID;

  /**
   * Words already learned
   * in this text.
   */
  learnedWordIds: ID[];

  /**
   * Grammar constructions already learned.
   */
  learnedConstructionIds: ID[];

  /**
   * Current learning step.
   */
  currentStep: number;

  /**
   * User's progress through the text.
   *
   * 0.0 - 1.0
   */
  progress: number;

  updatedAt: Timestamp;
}

// ============================================================
// USER TRANSLATION VOTE
// ============================================================

export interface TranslationVote {
  id: ID;

  userId: ID;

  type: "word" | "construction" | "finalTranslation";

  /**
   * ID of the proposal being rated.
   */
  proposalId: ID;

  /**
   * +1 = useful/correct
   * -1 = incorrect
   */
  value: 1 | -1;

  createdAt: Timestamp;
}

/**
 * A personal notice. Dislikers receive one when a poor translation is removed.
 */
export interface UserNotification {
  id: ID;

  userId: ID;

  type: "translation-removed";

  /** Source word the translation belonged to. */
  word: string;

  /** The translation that was removed. */
  translation: string;

  read: boolean;

  createdAt: Timestamp;
}

// ============================================================
// TEXT RATING
// ============================================================

export interface TextRating {
  id: ID;

  textId: ID;

  userId: ID;

  /**
   * 1-5
   */
  usefulness?: number;

  /**
   * 1-5
   */
  interestingness?: number;

  /**
   * 1-5
   */
  uniqueness?: number;

  /**
   * 1-5
   */
  learningValue?: number;

  createdAt: Timestamp;

  updatedAt: Timestamp;
}

// ============================================================
// TEXT CONTRIBUTOR
// ============================================================

export interface TextContributor {
  id: ID;

  textId: ID;

  userId: ID;

  contributions: ContributionType[];

  createdAt: Timestamp;
}

export type ContributionType =
  | "translation"
  | "correction"
  | "final_translation"
  | "construction"
  | "review";

// ============================================================
// TEXT SERIES (chapters)
// ============================================================

export interface TextSeries {
  id: ID;

  title: string;

  description?: string;

  imageUrl?: string;

  authorId: ID;

  /**
   * Ordered chapter text IDs.
   */
  textIds: ID[];

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================
// USER WORD × TEXT (mastery across texts)
// ============================================================

export interface UserWordTextHistory {
  userId: ID;

  wordId: ID;

  textId: ID;

  learnedAt: Timestamp;
}

// Unique key: userId + wordId + textId

// ============================================================
// REPORT (community flags — moderation after MVP)
// ============================================================

export type ReportTargetType =
  | "text"
  | "word"
  | "construction"
  | "translation"
  | "content";

export interface Report {
  id: ID;

  targetType: ReportTargetType;

  targetId: ID;

  userId: ID;

  reason: string;

  createdAt: Timestamp;
}

// ============================================================
// WORD EDIT (community proposal — not the live word card)
// ============================================================

export type WordEditField =
  | "word"
  | "character"
  | "furigana"
  | "type"
  | "translations"
  | "rootWords"
  | "grammarConstructions";

export type WordEditStatus = "pending" | "accepted" | "rejected";

/** Editable slice of a word. New labels are created only when the edit is accepted. */
export interface WordEditSnapshot {
  word: string;
  character: string;
  furigana: string;
  type: WordType;
  targetLanguage: LanguageCode;
  translationIds: ID[];
  addedTranslationLabels: string[];
  rootWordIds: ID[];
  addedRootLabels: string[];
  grammarConstructionIds: ID[];
  addedConstructionLabels: string[];
}

export interface WordEditSummaryLine {
  field: WordEditField;
  before: string;
  after: string;
}

export interface WordEdit {
  id: ID;
  wordId: ID;
  authorId: ID;
  createdAt: Timestamp;
  status: WordEditStatus;
  /** Set when a moderator decides. Community votes no longer move that edit. */
  resolution?: "votes" | "moderator";
  before: WordEditSnapshot;
  after: WordEditSnapshot;
  summary: WordEditSummaryLine[];
  resolvedAt?: Timestamp;
  resolvedBy?: ID;
}

export interface WordEditVote {
  id: ID;
  editId: ID;
  userId: ID;
  value: 1 | -1;
  createdAt: Timestamp;
}

/**
 * A block on editing anything.
 * endsAt is omitted when the ban is permanent.
 */
export interface EditBan {
  id: ID;
  userId: ID;
  editId: ID;
  /**
   * When set, the ban only blocks new items on this word.
   * Omitted bans block editing in general.
   */
  wordId?: ID;
  /**
   * Which list this word ban closes.
   * Omitted means new translations, so older bans stay translation bans.
   */
  scope?: "translation" | "character" | "furigana" | "root" | "construction";
  startedAt: Timestamp;
  endsAt?: Timestamp;
}

// Важная оговорка по Firestore
// В реальном Firestore я бы не складывал огромный sentences[] прямо в один документ LearningText, особенно если тексты могут быть длинными. Логическая модель выше остаётся такой же, но физически я бы сделал:
// texts/{textId}
// texts/{textId}/sentences/{sentenceId}
// users/{userId}
// words/{wordId}
// grammarConstructions/{constructionId}
// topics/{topicId}
// textRatings/{ratingId}
// translationVotes/{voteId}
// textSeries/{seriesId}
// reports/{reportId}
// users/{userId}/wordTextHistory/{wordId_textId}
// А TextSentence уже будет отдельным документом.
// Это важно из-за ограничения Firestore на размер одного документа и потому, что тебе потом понадобится независимо обновлять отдельные предложения и переводы.
// То есть TypeScript-модель мы уже зафиксировали, а на уровне Firestore просто разложим эти сущности по коллекциям/подколлекциям.
