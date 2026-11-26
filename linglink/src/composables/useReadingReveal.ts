import { ref, watch, type Ref } from 'vue'

import { READING_BATCH_SIZE } from '@/domain/text/readingFocus'

const STORAGE_KEY = 'linglink.readingReveal.v1'

export interface ReadingProgressEntry {
  revealed: number
  awarded: string[]
  finished: boolean
  showFinals: boolean
}

function emptyEntry(): ReadingProgressEntry {
  return { revealed: READING_BATCH_SIZE, awarded: [], finished: false, showFinals: false }
}

function readMap(): Record<string, unknown> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeMap(map: Record<string, unknown>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* private mode or a full quota: the reveal still works until reload */
  }
}

export function parseReadingEntry(value: unknown): ReadingProgressEntry {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return {
      revealed: value >= READING_BATCH_SIZE ? value : READING_BATCH_SIZE,
      awarded: [],
      finished: false,
      showFinals: false,
    }
  }
  if (!value || typeof value !== 'object') return emptyEntry()
  const entry = value as Partial<ReadingProgressEntry>
  const revealed =
    typeof entry.revealed === 'number' && entry.revealed >= READING_BATCH_SIZE
      ? entry.revealed
      : READING_BATCH_SIZE
  const awarded = Array.isArray(entry.awarded)
    ? entry.awarded.filter((id): id is string => typeof id === 'string')
    : []
  return {
    revealed,
    awarded,
    finished: entry.finished === true,
    showFinals: entry.showFinals === true,
  }
}

function storedEntry(textId: string): ReadingProgressEntry {
  return parseReadingEntry(readMap()[textId])
}

function storeEntry(textId: string, entry: ReadingProgressEntry) {
  const map = readMap()
  map[textId] = entry
  writeMap(map)
}

export function clearRevealCount(textId: string) {
  const map = readMap()
  delete map[textId]
  writeMap(map)
}

export function useReadingReveal(textId: Ref<string>) {
  const revealedCount = ref(READING_BATCH_SIZE)
  const awardedIds = ref<string[]>([])
  const finished = ref(false)
  const showFinals = ref(false)

  function apply(id: string) {
    const entry = id ? storedEntry(id) : emptyEntry()
    revealedCount.value = entry.revealed
    awardedIds.value = entry.awarded
    finished.value = entry.finished
    showFinals.value = entry.showFinals
  }

  watch(textId, apply, { immediate: true })

  function persist() {
    const id = textId.value
    if (!id) return
    storeEntry(id, {
      revealed: revealedCount.value,
      awarded: awardedIds.value,
      finished: finished.value,
      showFinals: showFinals.value,
    })
  }

  function revealMore(total: number) {
    if (!textId.value || revealedCount.value >= total) return
    revealedCount.value = Math.min(revealedCount.value + READING_BATCH_SIZE, total)
    persist()
  }

  function noteAwarded(wordIds: string[]) {
    if (!wordIds.length) return
    const ids = new Set(awardedIds.value)
    for (const wordId of wordIds) ids.add(wordId)
    awardedIds.value = [...ids]
    persist()
  }

  function markFinished() {
    finished.value = true
    persist()
  }

  function markFinalsShown() {
    showFinals.value = true
    persist()
  }

  function restart() {
    const empty = emptyEntry()
    revealedCount.value = empty.revealed
    awardedIds.value = empty.awarded
    finished.value = empty.finished
    showFinals.value = empty.showFinals
    persist()
  }

  return {
    revealedCount,
    awardedIds,
    finished,
    showFinals,
    revealMore,
    noteAwarded,
    markFinished,
    markFinalsShown,
    restart,
  }
}
