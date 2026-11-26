/**
 * Chinese has no spaces. Without a dictionary, split particles out and group the rest in pairs.
 * Learners can still fix leftovers in the sentence editor.
 */

const HAN = /\p{Script=Han}/u
const PARTICLES = new Set(['的', '了', '着', '过', '吗', '呢', '吧', '啊', '嘛', '呀', '么'])

function chunkHan(text: string): string[] {
  const chars = [...text]
  if (chars.some((ch) => !HAN.test(ch))) return [text]
  const chunks: string[] = []
  for (let index = 0; index < chars.length; ) {
    if (index + 1 < chars.length) {
      chunks.push(chars[index]! + chars[index + 1]!)
      index += 2
    } else {
      chunks.push(chars[index]!)
      index += 1
    }
  }
  return chunks
}

/** Split one Chinese letter-run (no spaces, no punctuation) into words. */
export function segmentChinese(text: string): string[] {
  if (![...text].some((ch) => HAN.test(ch))) return [text]
  const words: string[] = []
  let buffer = ''
  const flush = () => {
    if (!buffer) return
    words.push(...chunkHan(buffer))
    buffer = ''
  }
  for (const ch of text) {
    if (PARTICLES.has(ch)) {
      flush()
      words.push(ch)
      continue
    }
    buffer += ch
  }
  flush()
  return words.filter(Boolean)
}
