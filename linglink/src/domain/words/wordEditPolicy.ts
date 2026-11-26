/** Community edits stay off the word card until this many more ups than downs. */
export const EDIT_UP_LEAD = 10

/** More downs than this removes the edit. */
export const EDIT_DOWN_LIMIT = 100

/** This many edit bans, including expired ones, makes the next ban permanent. */
export const EDIT_BAN_LIMIT = 5

export const EDIT_BAN_MS = 30 * 24 * 60 * 60 * 1000

/** A bad human translation is removed, and its author cannot add another for a week. */
export const TRANSLATION_BAN_MS = 7 * 24 * 60 * 60 * 1000

/** Below this many votes, dislikes must lead by a fixed margin. */
export const TRANSLATION_MANY_VOTES = 30

export const TRANSLATION_DISLIKE_LEAD = 10

/** At or above TRANSLATION_MANY_VOTES, dislikes must be at least this many times the likes. */
export const TRANSLATION_DISLIKE_MULTIPLE = 2

/** The translation is barely used when texts × this is still below the number of votes. */
export const TRANSLATION_USE_FACTOR = 3

/** Finished texts required before someone can moderate. */
export const MODERATOR_TEXTS_FINISHED = 3

/** Words at mastery level 1 or higher. */
export const MODERATOR_WORDS_KNOWN = 10

/** Ratings left by other people on texts this user authored. */
export const MODERATOR_RATINGS_NEEDED = 3

/** Average of those rating scores, on the 1–5 scale. */
export const MODERATOR_MIN_AVERAGE = 4

export type EditVerdict = 'pending' | 'accept' | 'reject' | 'reject-ban'

export function editVerdict(up: number, down: number): EditVerdict {
  if (down > EDIT_DOWN_LIMIT) return up > down ? 'reject' : 'reject-ban'
  if (up >= down + EDIT_UP_LEAD) return 'accept'
  return 'pending'
}

/** Undefined means the ban does not expire. */
export function banEndsAt(startedAtMs: number, bansAlreadyStored: number): number | undefined {
  if (bansAlreadyStored + 1 >= EDIT_BAN_LIMIT) return undefined
  return startedAtMs + EDIT_BAN_MS
}

/**
 * Remove a human translation when dislikes overwhelm likes and almost nobody uses it in texts.
 * Few votes: dislikes lead by at least 10. Many votes: dislikes are at least double the likes.
 */
export function shouldRemoveTranslation(input: { up: number; down: number; textCount: number }): boolean {
  const votes = input.up + input.down
  if (votes <= 0 || input.down <= 0) return false
  const votesBad =
    votes < TRANSLATION_MANY_VOTES
      ? input.down >= input.up + TRANSLATION_DISLIKE_LEAD
      : input.down >= Math.max(1, input.up) * TRANSLATION_DISLIKE_MULTIPLE
  if (!votesBad) return false
  return input.textCount * TRANSLATION_USE_FACTOR < votes
}

export function isBanActive(endsAt: number | undefined, now = Date.now()): boolean {
  if (endsAt === undefined) return true
  return endsAt > now
}

export function qualifiesAsModerator(input: {
  finishedTexts: number
  knownWords: number
  ratingCount: number
  ratingAverage: number
}): boolean {
  return (
    input.finishedTexts >= MODERATOR_TEXTS_FINISHED &&
    input.knownWords >= MODERATOR_WORDS_KNOWN &&
    input.ratingCount >= MODERATOR_RATINGS_NEEDED &&
    input.ratingAverage >= MODERATOR_MIN_AVERAGE
  )
}
