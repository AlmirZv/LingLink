/**
 * Modern Korean already uses spaces. Peel a trailing particle (josa) off a Hangul word
 * so 학교에 becomes 학교 + 에, like Japanese へ.
 */

const JOSA = [
  '에게서',
  '으로부터',
  '으로서',
  '에서부터',
  '이라는',
  '이라고',
  '께서는',
  '에서는',
  '으로는',
  '까지도',
  '에서',
  '에게',
  '한테',
  '으로',
  '로서',
  '부터',
  '까지',
  '처럼',
  '같이',
  '께서',
  '은',
  '는',
  '이',
  '가',
  '을',
  '를',
  '의',
  '에',
  '와',
  '과',
  '도',
  '만',
  '로',
].sort((left, right) => right.length - left.length || left.localeCompare(right))

const HANGUL_WORD = /^\p{Script=Hangul}+$/u

/** Split one Korean letter-run if it ends with a particle. */
export function segmentKorean(text: string): string[] {
  if (!HANGUL_WORD.test(text)) return [text]
  for (const josa of JOSA) {
    if (text.length <= josa.length) continue
    if (!text.endsWith(josa)) continue
    const stem = text.slice(0, text.length - josa.length)
    if (!HANGUL_WORD.test(stem)) continue
    return [stem, josa]
  }
  return [text]
}
