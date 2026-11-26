/**
 * Japanese has no spaces, so the generic tokenizer would keep a whole clause as one word.
 * Split a letter-run with script changes and a short list of particles and copulas.
 * Consecutive kanji stay together. Okurigana stays with the kanji. た/て/だ are not particles.
 */

type Script = 'kanji' | 'hira' | 'kata' | 'digit' | 'other'

interface Atom {
  kind: Script
  text: string
}

/** Grammatical chunks, longest first. Single た/て/だ are omitted so 行った stays one word. */
const GRAMMAR = [
  'ませんでした',
  'によって',
  'について',
  'でしょう',
  'ました',
  'ません',
  'だろう',
  'だった',
  'からは',
  'までに',
  'までも',
  'として',
  'ます',
  'です',
  'から',
  'まで',
  'より',
  'では',
  'には',
  'へは',
  'とは',
  'かも',
  'とか',
  'ては',
  'は',
  'が',
  'を',
  'に',
  'へ',
  'と',
  'で',
  'も',
  'や',
  'の',
  'か',
  'ね',
  'よ',
  'わ',
  'ぞ',
].sort((a, b) => b.length - a.length || a.localeCompare(b))

/** Trailing marks safe to peel off a content word. Sentence-final かねよわぞ would split おかね. */
const PEEL = GRAMMAR.filter((marker) => !['か', 'ね', 'よ', 'わ', 'ぞ'].includes(marker))

function scriptOf(ch: string): Script {
  if (/\p{Script=Han}/u.test(ch)) return 'kanji'
  if (ch === 'ー' || /\p{Script=Katakana}/u.test(ch)) return 'kata'
  if (/\p{Script=Hiragana}/u.test(ch)) return 'hira'
  if (/\p{N}/u.test(ch)) return 'digit'
  return 'other'
}

function atomsOf(text: string): Atom[] {
  const atoms: Atom[] = []
  for (const ch of text) {
    const last = atoms[atoms.length - 1]
    if (ch === 'ー' && last && (last.kind === 'hira' || last.kind === 'kata')) {
      last.text += ch
      continue
    }
    const kind = scriptOf(ch)
    if (last && last.kind === kind) last.text += ch
    else atoms.push({ kind, text: ch })
  }
  return atoms
}

function markerAt(text: string, index: number, markers: readonly string[]): string | null {
  const slice = text.slice(index)
  for (const marker of markers) {
    if (slice.startsWith(marker)) return marker
  }
  return null
}

/** Longest-match left to right. Returns null when any remainder is not a marker. */
function consumeGrammar(text: string): string[] | null {
  const parts: string[] = []
  let index = 0
  while (index < text.length) {
    const marker = markerAt(text, index, GRAMMAR)
    if (!marker) return null
    parts.push(marker)
    index += marker.length
  }
  return parts.length ? parts : null
}

function splitHiragana(text: string): string[] {
  const whole = consumeGrammar(text)
  if (whole) return whole

  const suffix = markerAt(text, 0, PEEL) ? null : longestSuffix(text)
  if (suffix && text.length - suffix.length >= 2) {
    return [...splitHiragana(text.slice(0, text.length - suffix.length)), suffix]
  }

  for (let index = 2; index < text.length; index++) {
    const marker = markerAt(text, index, PEEL)
    if (!marker) continue
    const right = text.slice(index + marker.length)
    if (right.length === 0) continue
    if (right.length < 2 && !consumeGrammar(right)) continue
    return [...splitHiragana(text.slice(0, index)), marker, ...splitHiragana(right)]
  }

  return [text]
}

function longestSuffix(text: string): string | null {
  let found: string | null = null
  for (const marker of PEEL) {
    if (text.length > marker.length && text.endsWith(marker)) {
      if (!found || marker.length > found.length) found = marker
    }
  }
  return found
}

function peelOkurigana(kanji: string, hiragana: string): string[] {
  const combined = kanji + hiragana
  const suffix = longestSuffix(combined)
  if (suffix && combined.length - suffix.length >= kanji.length) {
    const stem = combined.slice(0, combined.length - suffix.length)
    return [stem, ...splitHiragana(suffix)]
  }
  return [combined]
}

/** Split one Japanese letter-run (no spaces, no punctuation) into words. */
export function segmentJapanese(text: string): string[] {
  const atoms = atomsOf(text)
  const words: string[] = []

  for (let index = 0; index < atoms.length; index++) {
    const atom = atoms[index]!
    const next = atoms[index + 1]

    if (atom.kind === 'kanji' && next?.kind === 'hira') {
      const head = markerAt(next.text, 0, GRAMMAR)
      if (head) {
        words.push(atom.text, ...splitHiragana(next.text))
      } else {
        words.push(...peelOkurigana(atom.text, next.text))
      }
      index += 1
      continue
    }

    if (atom.kind === 'hira') {
      words.push(...splitHiragana(atom.text))
      continue
    }

    words.push(atom.text)
  }

  return words.filter((word) => word.length > 0)
}
