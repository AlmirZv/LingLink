<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { foldSurface, normalizeWordStress, textDirection } from '@/constants/languages'
import { usesCharacterScript } from '@/domain/words/characterReading'
import {
  proposalsForSentence,
  replaceSentenceProposals,
  winningFinalProposal,
} from '@/domain/text/finalTranslationProposals'
import FinalTranslationDialog from '@/components/texts/FinalTranslationDialog.vue'
import WordGlyph from '@/components/words/WordGlyph.vue'
import PixelButton from '@/components/ui/PixelButton.vue'
import PixelCard from '@/components/ui/PixelCard.vue'
import PixelDialog from '@/components/ui/PixelDialog.vue'
import PixelInput from '@/components/ui/PixelInput.vue'
import TranslationChoices from '@/components/words/TranslationChoices.vue'
import {
  activeTranslationBan,
  deleteOwnTranslation,
  loadTranslationChoices,
  translationBanLabel,
  voteWordTranslation,
  type TranslationChoice,
} from '@/services/translationChoices'
import { persistFinalProposals } from '@/services/communityService'
import { weightedTranslationProgress } from '@/services/textDenormalize'
import type { Repositories } from '@/services/repositories/contracts'
import {
  fillMissingScanTranslations,
  retokenizeScanSentence,
  spacedScanSentence,
  type ScanColumn,
  type ScanSentence,
  type ScanWord,
  type TextScan,
} from '@/services/textScan'
import type { AnalyzedConstruction } from '@/types/analysis'
import type { FinalTranslationProposal, GrammarConstruction, ID, Word } from '@/types/db'

const props = withDefaults(
  defineProps<{
    scan: TextScan
    repos: Repositories
    authorId: ID
    savedProposals?: FinalTranslationProposal[]
    persistTextId?: ID
    showTitle?: boolean
    /** Supplementing a published text: filled kanji and furigana stay as they are. */
    lockFilledReadings?: boolean
  }>(),
  { showTitle: true, lockFilledReadings: false },
)

const emit = defineEmits<{
  progress: [value: number]
}>()

const { t, locale } = useI18n()
const sourceDir = computed(() => textDirection(props.scan.analysis.language))
const targetDir = computed(() => textDirection(props.scan.targetLanguage))

const openColumnId = ref<string | null>(null)
const addingTranslation = ref(false)
const addingRoot = ref(false)
const addingConstruction = ref(false)
const translationId = ref('')
const translationChoices = ref<TranslationChoice[]>([])
const translationBan = ref('')
const customTranslation = ref('')
const sourceKanji = ref('')
const sourceFurigana = ref('')
const translationKanji = ref('')
const translationFurigana = ref('')
const newRoot = ref('')
const newConstruction = ref('')
const saving = ref(false)
const dialogError = ref<string | null>(null)
const joinOver = ref<{ sentenceId: string; columnId: string } | null>(null)
const joinFrom = ref<{ sentenceId: string; columnId: string } | null>(null)
const joinError = ref('')
const constructionTarget = ref<AnalyzedConstruction | null>(null)
const constructionTitle = computed(() => {
  const target = constructionTarget.value
  if (!target) return t('analysis.constructionInput')
  const sentence = props.scan.sentences.find((item) => item.id === target.sentenceId)
  const group = sentence ? columnGroups(sentence).find((item) => item.construction === target) : undefined
  return group ? groupLabel(group) : target.text
})
const constructionPhraseInput = ref('')
const constructionFuriganaInput = ref('')
const constructionUsesCharacters = computed(
  () => usesCharacterScript(props.scan.targetLanguage) || usesCharacterScript(props.scan.analysis.language),
)
const constructionSaving = ref(false)
const constructionError = ref('')
let joinDrag: { sentenceId: string; columnId: string; x: number; y: number; moved: boolean; pointerId: number } | null = null
let suppressTranslationClick = false

const segmentSentenceId = ref<string | null>(null)
const segmentDraft = ref('')
const segmentSaving = ref(false)
const segmentError = ref('')

function openSegment(sentence: ScanSentence) {
  if (segmentSaving.value) return
  segmentSentenceId.value = sentence.id
  segmentDraft.value = spacedScanSentence(sentence.columns)
  segmentError.value = ''
}

function closeSegment() {
  if (segmentSaving.value) return
  segmentSentenceId.value = null
  segmentError.value = ''
}

async function saveSegment() {
  const sentenceId = segmentSentenceId.value
  if (!sentenceId || segmentSaving.value) return
  segmentSaving.value = true
  segmentError.value = ''
  try {
    const result = await retokenizeScanSentence(
      props.scan,
      sentenceId,
      segmentDraft.value,
      props.repos,
      props.authorId,
    )
    if (!result.ok) {
      segmentError.value =
        result.reason === 'mismatch'
          ? t(props.lockFilledReadings ? 'analysis.splitWordsNotAuthor' : 'analysis.splitWordsMismatch')
          : t('analysis.splitWordsEmpty')
      return
    }
    segmentSentenceId.value = null
  } catch (error) {
    segmentError.value = error instanceof Error ? error.message : t('analysis.saveFailed')
  } finally {
    segmentSaving.value = false
  }
}

const finalOpen = ref(false)
const finalSentenceId = ref<string | null>(null)
const finalSaving = ref(false)
const finalError = ref('')
const finalProposals = ref<FinalTranslationProposal[]>(
  props.savedProposals?.map((item) => ({ ...item, likedBy: [...(item.likedBy ?? [])] })) ?? [],
)

const openFinalProposals = computed(() =>
  finalSentenceId.value ? proposalsForSentence(finalProposals.value, finalSentenceId.value) : [],
)

const translationProgress = computed(() => {
  const columns = props.scan.sentences.flatMap((sentence) => sentence.columns.filter((column) => column.kind === 'word'))
  const wordRatio = columns.length === 0 ? 1 : columns.filter((column) => column.selectedTranslationId).length / columns.length
  const sentences = props.scan.sentences
  const finalRatio =
    sentences.length === 0
      ? 1
      : sentences.filter((sentence) => Boolean(winningFinalProposal(proposalsForSentence(finalProposals.value, sentence.id))))
          .length / sentences.length
  return weightedTranslationProgress(wordRatio, finalRatio)
})

watch(translationProgress, (value) => emit('progress', value), { immediate: true })

function sentenceSourceText(sentenceId: string): string {
  const analyzed = props.scan.analysis.sentences.find((item) => item.id === sentenceId)
  if (analyzed?.text?.trim()) return analyzed.text
  const sentence = props.scan.sentences.find((item) => item.id === sentenceId)
  if (!sentence) return ''
  return sentence.columns.map((column) => column.text).join('')
}

function openFinal(sentenceId: string) {
  finalSentenceId.value = sentenceId
  finalOpen.value = true
}

function closeFinal() {
  finalOpen.value = false
  finalSentenceId.value = null
}

function sentenceFinal(sentenceId: string) {
  return winningFinalProposal(proposalsForSentence(finalProposals.value, sentenceId))?.text ?? ''
}

async function onFinalChange(next: FinalTranslationProposal[]) {
  const sentenceId = finalSentenceId.value
  if (!sentenceId) return
  finalProposals.value = replaceSentenceProposals(finalProposals.value, sentenceId, next)
  if (!props.persistTextId) return
  finalSaving.value = true
  finalError.value = ''
  try {
    await persistFinalProposals(props.repos, props.persistTextId, props.scan.targetLanguage, finalProposals.value)
  } catch (error) {
    finalError.value = error instanceof Error ? error.message : t('analysis.saveFailed')
  } finally {
    finalSaving.value = false
  }
}

const openFinalSource = computed(() =>
  finalSentenceId.value ? sentenceSourceText(finalSentenceId.value) : '',
)

defineExpose({
  finalProposals: () => finalProposals.value,
})

function compactSurface(value: string): string {
  return value.replace(/\s+/g, '')
}

function phraseSurface(sentence: ScanSentence, span: ScanColumn[]): string {
  if (!span.length) return ''
  const analyzed = props.scan.analysis.sentences.find((item) => item.id === sentence.id)
  const first = span[0]!
  const last = span[span.length - 1]!
  if (!analyzed) return span.map((column) => column.text).join('')
  const start = sentence.columns.findIndex((column) => column.id === first.id)
  const end = sentence.columns.findIndex((column) => column.id === last.id)
  let cursor = 0
  let from = 0
  let to = analyzed.text.length
  for (let index = 0; index < sentence.columns.length; index += 1) {
    const column = sentence.columns[index]!
    const at = analyzed.text.indexOf(column.text, cursor)
    const pos = at >= 0 ? at : cursor
    if (index === start) from = pos
    if (index === end) {
      to = pos + column.text.length
      break
    }
    cursor = pos + column.text.length
  }
  return analyzed.text.slice(from, to)
}

function sentenceConstructions(sentenceId: string) {
  return props.scan.analysis.constructions.filter((item) => item.sentenceId === sentenceId)
}

async function findConstruction(sources: Word[], surface: string): Promise<GrammarConstruction | null> {
  const key = compactSurface(surface)
  const seen = new Set<string>()
  for (const source of sources) {
    for (const id of source.grammarConstructions) {
      if (seen.has(id)) continue
      seen.add(id)
      const construction = await props.repos.constructions.getById(id)
      if (!construction) continue
      if (compactSurface(construction.construction) === key) return construction
      const forms = construction.forms.length ? construction.forms : [construction.construction]
      if (forms.some((form) => compactSurface(form) === key)) return construction
    }
  }
  return null
}

function connectColumns(sentence: ScanSentence, sourceColumnId: string, targetColumnId: string) {
  const sourceGroup = groupByColumn(sentence, sourceColumnId)
  const targetGroup = groupByColumn(sentence, targetColumnId)
  if (!sourceGroup || !targetGroup || sourceGroup.key === targetGroup.key || sourceGroup.construction) return
  if (!groupsTouch(sentence, sourceGroup, targetGroup)) return
  const ordered =
    groupStart(sentence, sourceGroup) < groupStart(sentence, targetGroup)
      ? [sourceGroup, targetGroup]
      : [targetGroup, sourceGroup]
  const from = sentence.columns.findIndex((column) => column.id === ordered[0]!.columns[0]!.id)
  const last = ordered[1]!.columns[ordered[1]!.columns.length - 1]!
  const to = sentence.columns.findIndex((column) => column.id === last.id)
  if (from < 0 || to < from) return
  const span = sentence.columns.slice(from, to + 1)
  const columns = span.filter((column) => column.kind === 'word')
  if (columns.length < 2) return
  if (targetGroup.construction) {
    const index = props.scan.analysis.constructions.indexOf(targetGroup.construction)
    if (index >= 0) props.scan.analysis.constructions.splice(index, 1)
  }
  const words = sentence.columns.filter((column) => column.kind === 'word')
  const indexes = columns.map((column) => words.findIndex((word) => word.id === column.id))
  const wordIds = columns
    .map((column) => props.scan.words[column.normalized]?.sourceWordId)
    .filter((id): id is string => Boolean(id))
  props.scan.analysis.constructions.push({
    constructionId: `local-${crypto.randomUUID()}`,
    text: phraseSurface(sentence, span),
    sentenceId: sentence.id,
    startPosition: Math.min(...indexes),
    endPosition: Math.max(...indexes),
    ...(wordIds.length === columns.length ? { wordIds } : {}),
  })
}

function openConstruction(construction: AnalyzedConstruction) {
  constructionTarget.value = construction
  constructionPhraseInput.value = construction.phrase ?? ''
  constructionFuriganaInput.value = construction.phraseFurigana ?? ''
  constructionError.value = ''
}

function closeConstruction() {
  if (constructionSaving.value) return
  constructionTarget.value = null
  constructionError.value = ''
}

async function saveConstructionPhrase() {
  const target = constructionTarget.value
  const phrase = constructionPhraseInput.value.trim()
  if (!target || constructionSaving.value) return
  if (!phrase) {
    constructionError.value = t('analysis.constructionRequired')
    return
  }
  const sentence = props.scan.sentences.find((item) => item.id === target.sentenceId)
  const group = sentence ? columnGroups(sentence).find((item) => item.construction === target) : undefined
  const columns = group?.columns.filter((column) => column.kind === 'word') ?? []
  if (!sentence || columns.length < 2) return
  constructionSaving.value = true
  constructionError.value = ''
  try {
    const sources: Word[] = []
    for (const column of columns) {
      const scanWord = props.scan.words[column.normalized]
      if (scanWord) sources.push(await ensureSource(scanWord))
    }
    const wordIds = sources.map((source) => source.id)
    const surface = target.text
    let stored: GrammarConstruction | null = null
    if (!target.constructionId.startsWith('local-')) {
      stored = await props.repos.constructions.getById(target.constructionId)
    }
    if (!stored) stored = await findConstruction(sources, phrase)
    const language = sources[0]?.language ?? props.scan.analysis.language
    const reading = constructionUsesCharacters.value ? constructionFuriganaInput.value.trim() : ''
    const withReading = (construction: GrammarConstruction): GrammarConstruction => {
      const next: GrammarConstruction = {
        ...construction,
        construction: phrase,
        forms: construction.forms.includes(surface) ? construction.forms : [surface, ...construction.forms],
        wordIds,
        relatedWords: wordIds,
        updatedAt: ts(),
      }
      if (reading) next.furigana = reading
      else delete next.furigana
      return next
    }
    if (stored) {
      stored = await props.repos.constructions.update(withReading(stored))
    } else {
      stored = await props.repos.constructions.create(
        withReading({
          id: `gc-${crypto.randomUUID()}`,
          language,
          construction: phrase,
          forms: [surface],
          translations: {},
          type: 'expression',
          wordIds,
          relatedWords: wordIds,
          createdBy: props.authorId,
          createdAt: ts(),
          updatedAt: ts(),
        }),
      )
    }
    for (const source of sources) {
      if (source.grammarConstructions.includes(stored.id)) continue
      await props.repos.words.update({
        ...source,
        grammarConstructions: [...source.grammarConstructions, stored.id],
        updatedAt: ts(),
      })
    }
    target.constructionId = stored.id
    target.wordIds = wordIds
    target.phrase = phrase
    if (reading) target.phraseFurigana = reading
    else delete target.phraseFurigana
    constructionTarget.value = null
  } catch (error) {
    constructionError.value = error instanceof Error ? error.message : t('analysis.saveFailed')
  } finally {
    constructionSaving.value = false
  }
}

function findColumn(columnId: string) {
  for (const sentence of props.scan.sentences) {
    const column = sentence.columns.find((item) => item.id === columnId)
    if (column) return column
  }
  return undefined
}

const activeColumn = () => (openColumnId.value ? findColumn(openColumnId.value) : undefined)
const active = () => {
  const column = activeColumn()
  return column ? props.scan.words[column.normalized] : undefined
}

function bothUseCharacters(word: ScanWord | undefined): boolean {
  return Boolean(word && usesCharacterScript(word.language) && usesCharacterScript(props.scan.targetLanguage))
}

function readingLabel(kind: 'kanji' | 'furigana', side: 'source' | 'translation'): string {
  const word = active()
  if (!bothUseCharacters(word)) {
    return t(kind === 'kanji' ? 'analysis.kanjiLabel' : 'analysis.furiganaLabel')
  }
  if (side === 'source') {
    return t(kind === 'kanji' ? 'analysis.sourceKanjiLabel' : 'analysis.sourceFuriganaLabel')
  }
  return t(kind === 'kanji' ? 'analysis.translationKanjiLabel' : 'analysis.translationFuriganaLabel')
}

const selectedChoice = computed(() => translationChoices.value.find((item) => item.id === translationId.value))
const typingNewTranslation = computed(() => Boolean(customTranslation.value.trim()))
const sourceKanjiLocked = computed(() => props.lockFilledReadings && Boolean(active()?.character))
const sourceFuriganaLocked = computed(() => props.lockFilledReadings && Boolean(active()?.furigana))
const translationKanjiLocked = computed(() => {
  if (!props.lockFilledReadings || addingTranslation.value || typingNewTranslation.value) return false
  return Boolean(selectedChoice.value?.character)
})
const translationFuriganaLocked = computed(() => {
  if (!props.lockFilledReadings || addingTranslation.value || typingNewTranslation.value) return false
  return Boolean(selectedChoice.value?.furigana)
})
const readingsLocked = computed(
  () =>
    sourceKanjiLocked.value ||
    sourceFuriganaLocked.value ||
    translationKanjiLocked.value ||
    translationFuriganaLocked.value,
)
const canDeleteTranslation = computed(() => {
  const choice = selectedChoice.value
  return Boolean(
    props.lockFilledReadings &&
      choice &&
      choice.createdBy === props.authorId &&
      !addingTranslation.value &&
      !typingNewTranslation.value,
  )
})

function applyTranslationReading(id: string) {
  const chosen = active()?.options.find((option) => option.id === id)
  translationKanji.value = chosen?.character ?? ''
  translationFurigana.value = chosen?.furigana ?? ''
}

function openWord(columnId: string) {
  const column = findColumn(columnId)
  const word = column ? props.scan.words[column.normalized] : undefined
  if (!column || !word) return
  openColumnId.value = columnId
  addingTranslation.value = false
  addingRoot.value = false
  addingConstruction.value = false
  translationId.value = column.selectedTranslationId ?? ''
  customTranslation.value = ''
  sourceKanji.value = word.character ?? ''
  sourceFurigana.value = word.furigana ?? ''
  applyTranslationReading(column.selectedTranslationId ?? '')
  newRoot.value = ''
  newConstruction.value = ''
  dialogError.value = null
  translationBan.value = ''
  translationChoices.value = word.options.map((option) => ({
    id: option.id,
    label: option.label,
    ...(option.furigana ? { furigana: option.furigana } : {}),
    ...(option.character ? { character: option.character } : {}),
    human: false,
    up: 0,
    down: 0,
    mine: null,
    textCount: 0,
  }))
  void refreshTranslationChoices(word)
}

async function refreshTranslationChoices(word: ScanWord) {
  const source = word.sourceWordId ? await props.repos.words.getById(word.sourceWordId) : null
  if (!source) {
    translationChoices.value = word.options.map((option) => ({
      id: option.id,
      label: option.label,
      ...(option.furigana ? { furigana: option.furigana } : {}),
      ...(option.character ? { character: option.character } : {}),
      human: false,
      up: 0,
      down: 0,
      mine: null,
      textCount: 0,
    }))
    return
  }
  const [choices, ban] = await Promise.all([
    loadTranslationChoices(props.repos, source, props.scan.targetLanguage, props.authorId),
    activeTranslationBan(props.repos, props.authorId, source.id),
  ])
  translationChoices.value = choices
  translationBan.value = translationBanLabel(ban, t, locale.value)
}

async function voteTranslation(id: string, value: 1 | -1) {
  const word = active()
  if (!word) return
  const source = await ensureSource(word)
  const result = await voteWordTranslation(props.repos, source.id, id, props.authorId, value)
  if (result.removed) {
    word.options = word.options.filter((option) => option.id !== id)
    if (translationId.value === id) translationId.value = word.options[0]?.id ?? ''
    dialogError.value = t('words.translationRemoved')
  }
  await refreshTranslationChoices(word)
}

watch(translationId, (id) => {
  if (!usesCharacterScript(props.scan.targetLanguage) || addingTranslation.value || customTranslation.value.trim()) return
  applyTranslationReading(id)
})

watch(addingTranslation, (value) => {
  if (!value || !usesCharacterScript(props.scan.targetLanguage)) return
  translationKanji.value = ''
  translationFurigana.value = ''
})

watch(customTranslation, (value, previous) => {
  if (previous?.trim() || !value.trim() || !usesCharacterScript(props.scan.targetLanguage)) return
  translationKanji.value = ''
  translationFurigana.value = ''
})

function closeWord() {
  openColumnId.value = null
  addingTranslation.value = false
  addingRoot.value = false
  addingConstruction.value = false
}

interface ReviewGroup {
  key: string
  columns: ScanColumn[]
  construction: AnalyzedConstruction | null
}

function sourceId(column: ScanColumn): string | undefined {
  if (column.kind !== 'word') return undefined
  return props.scan.words[column.normalized]?.sourceWordId
}

function constructionMembers(construction: AnalyzedConstruction): string[] {
  return construction.wordIds && construction.wordIds.length >= 2 ? construction.wordIds : []
}

function matchConstruction(
  columns: ScanColumn[],
  start: number,
  constructions: AnalyzedConstruction[],
): { construction: AnalyzedConstruction; end: number } | null {
  for (const construction of constructions) {
    const ids = constructionMembers(construction)
    if (ids.length < 2) continue
    let seen = 0
    let end = start
    let matched = true
    for (let index = start; index < columns.length && seen < ids.length; index += 1) {
      const column = columns[index]!
      if (column.kind !== 'word') {
        end = index
        continue
      }
      if (sourceId(column) !== ids[seen]) {
        matched = false
        break
      }
      seen += 1
      end = index
    }
    if (matched && seen === ids.length) return { construction, end }
  }

  const wordIndex = columns.slice(0, start + 1).filter((column) => column.kind === 'word').length - 1
  const byPosition = constructions.find(
    (construction) =>
      construction.startPosition === wordIndex &&
      construction.endPosition > wordIndex &&
      constructionMembers(construction).length < 2,
  )
  if (!byPosition) return null
  let seen = 0
  let end = start
  for (let index = start; index < columns.length; index += 1) {
    if (columns[index]!.kind !== 'word') continue
    end = index
    if (wordIndex + seen >= byPosition.endPosition) break
    seen += 1
  }
  if (end <= start) return null
  return { construction: byPosition, end }
}

function columnGroups(sentence: ScanSentence): ReviewGroup[] {
  const constructions = sentenceConstructions(sentence.id)
  const groups: ReviewGroup[] = []
  let index = 0
  while (index < sentence.columns.length) {
    const column = sentence.columns[index]!
    if (column.kind !== 'word') {
      groups.push({ key: column.id, columns: [column], construction: null })
      index += 1
      continue
    }
    const match = matchConstruction(sentence.columns, index, constructions)
    if (!match) {
      groups.push({ key: column.id, columns: [column], construction: null })
      index += 1
      continue
    }
    groups.push({
      key: `${match.construction.constructionId}-${column.id}`,
      columns: sentence.columns.slice(index, match.end + 1),
      construction: match.construction,
    })
    index = match.end + 1
  }
  return groups
}

function groupByColumn(sentence: ScanSentence, columnId: string): ReviewGroup | null {
  return columnGroups(sentence).find((group) => group.columns.some((column) => column.id === columnId)) ?? null
}

function groupStart(sentence: ScanSentence, group: ReviewGroup): number {
  return sentence.columns.findIndex((column) => column.id === group.columns[0]?.id)
}

function wordRange(sentence: ScanSentence, group: ReviewGroup): { min: number; max: number } | null {
  const words = sentence.columns.filter((column) => column.kind === 'word')
  const indexes = group.columns
    .filter((column) => column.kind === 'word')
    .map((column) => words.findIndex((word) => word.id === column.id))
    .filter((index) => index >= 0)
  if (!indexes.length) return null
  return { min: Math.min(...indexes), max: Math.max(...indexes) }
}

function groupsTouch(sentence: ScanSentence, left: ReviewGroup, right: ReviewGroup): boolean {
  const a = wordRange(sentence, left)
  const b = wordRange(sentence, right)
  if (!a || !b) return false
  return a.max + 1 === b.min || b.max + 1 === a.min
}

function wordColumnId(group: ReviewGroup): string {
  return group.columns.find((column) => column.kind === 'word')?.id ?? ''
}

function groupLabel(group: ReviewGroup): string {
  return group.columns
    .map((column, index) => {
      const previous = group.columns[index - 1]
      const gap = previous?.kind === 'word' && column.kind === 'word' ? ' ' : ''
      return gap + column.text
    })
    .join('')
}

function isJoinTarget(sentence: ScanSentence, group: ReviewGroup): boolean {
  const over = joinOver.value
  const from = joinFrom.value
  if (!over || !from || over.sentenceId !== sentence.id || from.sentenceId !== sentence.id) return false
  if (!group.columns.some((column) => column.id === over.columnId)) return false
  const source = groupByColumn(sentence, from.columnId)
  if (!source || source.key === group.key || source.construction) return false
  return groupsTouch(sentence, source, group)
}

function splitConstruction(construction: AnalyzedConstruction) {
  const sentence = props.scan.sentences.find((item) => item.id === construction.sentenceId)
  if (sentence) {
    const group = columnGroups(sentence).find((item) => item.construction === construction)
    for (const column of group?.columns ?? []) {
      if (column.kind === 'word') column.selectedTranslationId = undefined
    }
  }
  const index = props.scan.analysis.constructions.indexOf(construction)
  if (index >= 0) props.scan.analysis.constructions.splice(index, 1)
}

function onBlockPointerDown(event: PointerEvent, sentenceId: string, columnId: string) {
  if (event.button !== 0) return
  suppressTranslationClick = false
  joinDrag = { sentenceId, columnId, x: event.clientX, y: event.clientY, moved: false, pointerId: event.pointerId }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onBlockPointerMove(event: PointerEvent) {
  if (!joinDrag || event.pointerId !== joinDrag.pointerId) return
  if (Math.hypot(event.clientX - joinDrag.x, event.clientY - joinDrag.y) > 8) {
    joinDrag.moved = true
    joinFrom.value = { sentenceId: joinDrag.sentenceId, columnId: joinDrag.columnId }
  }
  if (!joinDrag.moved) return
  const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-join-column]')
  const sentenceId = hit?.dataset.joinSentence
  const columnId = hit?.dataset.joinColumn
  joinOver.value = sentenceId && columnId ? { sentenceId, columnId } : null
}

function onBlockPointerUp(event: PointerEvent) {
  const drag = joinDrag
  const over = joinOver.value
  joinDrag = null
  joinFrom.value = null
  joinOver.value = null
  if (!drag || event.pointerId !== drag.pointerId) return
  if (drag.moved) suppressTranslationClick = true
  if (!drag.moved || !over || over.sentenceId !== drag.sentenceId) return
  const sentence = props.scan.sentences.find((item) => item.id === drag.sentenceId)
  if (!sentence) return
  void connectColumns(sentence, drag.columnId, over.columnId)
}

function onBlockPointerCancel() {
  joinDrag = null
  joinFrom.value = null
  joinOver.value = null
}

function onTranslationClick(columnId: string) {
  if (suppressTranslationClick) {
    suppressTranslationClick = false
    return
  }
  openWord(columnId)
}

function glyphOf(word: ScanWord | undefined, text: string) {
  return { word: text, furigana: word?.furigana }
}

function chosenGlyph(word: ScanWord, translationId: string) {
  const chosen = word.options.find((option) => option.id === translationId)
  return { word: chosen?.label ?? '', furigana: chosen?.furigana }
}

const ts = () => new Date().toISOString()

function fillEmptyReading(word: Word, character: string, furigana: string): Word {
  const next: Word = { ...word, updatedAt: ts() }
  const kanji = character.trim()
  const reading = furigana.trim()
  if (!word.character && kanji) {
    next.character = kanji
    const variants = [...(word.characterVariants ?? [])]
    if (!variants.some((item) => item.text === kanji)) {
      variants.push({ id: `character-${crypto.randomUUID()}`, text: kanji, createdBy: props.authorId })
    }
    next.characterVariants = variants
  }
  if (!word.furigana && reading) {
    next.furigana = reading
    const variants = [...(word.furiganaVariants ?? [])]
    if (!variants.some((item) => item.text === reading)) {
      variants.push({ id: `furigana-${crypto.randomUUID()}`, text: reading, createdBy: props.authorId })
    }
    next.furiganaVariants = variants
  }
  return next
}

function readingChanged(word: Word, character: string, furigana: string): boolean {
  if (props.lockFilledReadings) {
    return (!word.character && Boolean(character.trim())) || (!word.furigana && Boolean(furigana.trim()))
  }
  return (word.character ?? '') !== character.trim() || (word.furigana ?? '') !== furigana.trim()
}

function storedReading(word: Word, character: string, furigana: string): Word {
  return props.lockFilledReadings
    ? fillEmptyReading(word, character, furigana)
    : withReading(word, character, furigana)
}

function withReading(word: Word, character: string, furigana: string): Word {
  const next: Word = { ...word, updatedAt: ts() }
  const kanji = character.trim()
  const reading = furigana.trim()
  if (kanji) next.character = kanji
  else delete next.character
  if (reading) next.furigana = reading
  else delete next.furigana
  return next
}

async function ensureSource(word: ScanWord): Promise<Word> {
  if (word.sourceWordId) {
    const existing = await props.repos.words.getById(word.sourceWordId)
    if (existing) return existing
  }
  const created: Word = {
    id: `word-${crypto.randomUUID()}`,
    language: word.language,
    word: word.surface,
    translations: {},
    type: 'other',
    rootWords: [],
    grammarConstructions: [],
    createdBy: props.authorId,
    createdAt: ts(),
    updatedAt: ts(),
  }
  const stored = await props.repos.words.create(created)
  word.sourceWordId = stored.id
  return stored
}

async function saveWord() {
  const column = activeColumn()
  const word = active()
  if (!column || !word) return
    const typed = normalizeWordStress(customTranslation.value).trim()
  if (!word.options.length && !typed) {
    dialogError.value = t('analysis.translationRequired')
    return
  }
  if (word.options.length && !typed && !translationId.value) {
    dialogError.value = t('analysis.translationRequired')
    return
  }
  if (typed && translationBan.value) {
    dialogError.value = translationBan.value
    return
  }
  saving.value = true
  dialogError.value = null
  try {
    let source = await ensureSource(word)

    if (usesCharacterScript(word.language) && readingChanged(source, sourceKanji.value, sourceFurigana.value)) {
      source = await props.repos.words.update(storedReading(source, sourceKanji.value, sourceFurigana.value))
      word.character = source.character
      word.furigana = source.furigana
    }

    if (typed) {
      const duplicate = word.options.find(
        (option) => foldSurface(option.label, props.scan.targetLanguage) === foldSurface(typed, props.scan.targetLanguage),
      )
      if (duplicate) {
        column.selectedTranslationId = duplicate.id
      } else {
      const draft: Word = {
        id: `word-${crypto.randomUUID()}`,
        language: props.scan.targetLanguage,
        word: typed,
        translations: { [source.language]: [source.id] },
        type: 'other',
        rootWords: [],
        grammarConstructions: [],
        createdBy: props.authorId,
        createdAt: ts(),
        updatedAt: ts(),
      }
      const target = usesCharacterScript(props.scan.targetLanguage)
        ? withReading(draft, translationKanji.value, translationFurigana.value)
        : draft
      const storedTarget = await props.repos.words.create(target)
      const links = { ...source.translations }
      const list = links[props.scan.targetLanguage] ? [...links[props.scan.targetLanguage]!] : []
      if (!list.includes(storedTarget.id)) list.push(storedTarget.id)
      links[props.scan.targetLanguage] = list
      source = await props.repos.words.update({ ...source, translations: links, updatedAt: ts() })
      word.options.push({
        id: storedTarget.id,
        label: normalizeWordStress(storedTarget.word),
        character: storedTarget.character,
        furigana: storedTarget.furigana,
      })
      column.selectedTranslationId = storedTarget.id
      await refreshTranslationChoices(word)
      }
    } else if (translationId.value) {
      column.selectedTranslationId = translationId.value
      if (usesCharacterScript(props.scan.targetLanguage)) {
        const current = await props.repos.words.getById(translationId.value)
        if (current && readingChanged(current, translationKanji.value, translationFurigana.value)) {
          const storedTarget = await props.repos.words.update(
            storedReading(current, translationKanji.value, translationFurigana.value),
          )
          const option = word.options.find((item) => item.id === storedTarget.id)
          if (option) {
            option.label = storedTarget.word
            option.character = storedTarget.character
            option.furigana = storedTarget.furigana
          }
        }
      }
    }

    if (column.selectedTranslationId) {
      fillMissingScanTranslations(props.scan, word.normalized, column.selectedTranslationId)
    }

    const rootText = newRoot.value.trim()
    if (rootText) {
      const root: Word = {
        id: `word-${crypto.randomUUID()}`,
        language: source.language,
        word: rootText,
        translations: {},
        type: 'other',
        rootWords: [source.id],
        grammarConstructions: [],
        createdBy: props.authorId,
        createdAt: ts(),
        updatedAt: ts(),
      }
      const storedRoot = await props.repos.words.create(root)
      const rootWords = source.rootWords.includes(storedRoot.id)
        ? source.rootWords
        : [...source.rootWords, storedRoot.id]
      source = await props.repos.words.update({ ...source, rootWords, updatedAt: ts() })
      word.roots.push({ id: storedRoot.id, label: storedRoot.word })
    }

    const constructionText = newConstruction.value.trim()
    if (constructionText) {
      const construction: GrammarConstruction = {
        id: `gc-${crypto.randomUUID()}`,
        language: source.language,
        construction: constructionText,
        forms: [constructionText],
        translations: {},
        type: 'other',
        relatedWords: [source.id],
        createdBy: props.authorId,
        createdAt: ts(),
        updatedAt: ts(),
      }
      const stored = await props.repos.constructions.create(construction)
      const grammarConstructions = source.grammarConstructions.includes(stored.id)
        ? source.grammarConstructions
        : [...source.grammarConstructions, stored.id]
      await props.repos.words.update({ ...source, grammarConstructions, updatedAt: ts() })
      word.constructions.push({ id: stored.id, label: stored.construction })
    }

    closeWord()
  } catch (error) {
    dialogError.value = error instanceof Error ? error.message : t('analysis.saveFailed')
  } finally {
    saving.value = false
  }
}

async function deleteSelectedTranslation() {
  const word = active()
  const id = translationId.value
  if (!word || !id || !canDeleteTranslation.value || saving.value) return
  saving.value = true
  dialogError.value = null
  try {
    const source = await ensureSource(word)
    const removed = await deleteOwnTranslation(props.repos, source.id, id, props.authorId)
    if (!removed) {
      dialogError.value = t('analysis.saveFailed')
      return
    }
    word.options = word.options.filter((option) => option.id !== id)
    const fallback = word.options[0]?.id
    if (word.selectedTranslationId === id) word.selectedTranslationId = fallback ?? ''
    for (const sentence of props.scan.sentences) {
      for (const item of sentence.columns) {
        if (item.kind !== 'word' || item.normalized !== word.normalized) continue
        if (item.selectedTranslationId === id) item.selectedTranslationId = fallback
      }
    }
    translationId.value = fallback ?? ''
    customTranslation.value = ''
    addingTranslation.value = word.options.length === 0
    await refreshTranslationChoices(word)
  } catch (error) {
    dialogError.value = error instanceof Error ? error.message : t('analysis.saveFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PixelCard :title="showTitle ? t('analysis.previewTitle') : undefined">
    <p class="review-hint">{{ t('analysis.reviewHint') }}</p>
    <p class="review-hint">{{ t('analysis.stackHint') }}</p>

    <article v-for="sentence in scan.sentences" :key="sentence.id" class="sentence">
      <div class="columns" :dir="sourceDir">
        <template v-for="group in columnGroups(sentence)" :key="group.key">
          <div v-if="group.construction" class="glue">
            <div class="glue__words">
              <template v-for="column in group.columns" :key="column.id">
                <button
                  v-if="column.kind === 'word'"
                  type="button"
                  class="original original--split"
                  :class="{ 'original--construction': Boolean(group.construction.phrase) }"
                  @click="openSegment(sentence)"
                >
                  <WordGlyph :word="glyphOf(scan.words[column.normalized], column.text)" />
                </button>
                <button
                  v-else
                  type="button"
                  class="original original--split"
                  @click="openSegment(sentence)"
                >
                  {{ column.text }}
                </button>
              </template>
            </div>
            <div
              class="glue__frame"
              :dir="targetDir"
              :class="{
                'glue__frame--empty': !group.construction.phrase,
                'glue__frame--target': isJoinTarget(sentence, group),
              }"
              :data-join-sentence="sentence.id"
              :data-join-column="wordColumnId(group)"
            >
              <button type="button" class="glue__label" @click="openConstruction(group.construction)">
                <WordGlyph
                  v-if="group.construction.phrase"
                  :word="{ word: group.construction.phrase, furigana: group.construction.phraseFurigana }"
                />
                <span v-else>{{ t('analysis.addTranslation') }}</span>
              </button>
              <button
                type="button"
                class="glue__split"
                :aria-label="t('analysis.splitConstruction')"
                @click="splitConstruction(group.construction)"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M1.5 3.5h5v9h-5zM9.5 3.5h5v9h-5z" fill="none" stroke="currentColor" stroke-width="1.4" />
                </svg>
              </button>
            </div>
          </div>
          <div v-else class="column">
            <button
              v-if="group.columns[0]!.kind === 'word'"
              type="button"
              class="original original--split"
              @click="openSegment(sentence)"
            >
              <WordGlyph :word="glyphOf(scan.words[group.columns[0]!.normalized], group.columns[0]!.text)" />
            </button>
            <button
              v-else
              type="button"
              class="original original--split"
              @click="openSegment(sentence)"
            >
              {{ group.columns[0]!.text }}
            </button>
            <button
              v-if="group.columns[0]!.kind === 'word'"
              type="button"
              class="translation"
              :dir="targetDir"
              :class="{
                'translation--empty': !group.columns[0]!.selectedTranslationId,
                'translation--target': isJoinTarget(sentence, group),
                'translation--dragging': joinFrom?.sentenceId === sentence.id && joinFrom?.columnId === group.columns[0]!.id,
              }"
              :data-join-sentence="sentence.id"
              :data-join-column="group.columns[0]!.id"
              @pointerdown="onBlockPointerDown($event, sentence.id, group.columns[0]!.id)"
              @pointermove="onBlockPointerMove"
              @pointerup="onBlockPointerUp"
              @pointercancel="onBlockPointerCancel"
              @click="onTranslationClick(group.columns[0]!.id)"
            >
              <WordGlyph
                v-if="group.columns[0]!.selectedTranslationId && scan.words[group.columns[0]!.normalized]"
                :word="chosenGlyph(scan.words[group.columns[0]!.normalized]!, group.columns[0]!.selectedTranslationId)"
              />
              <span v-else>{{ t('analysis.addTranslation') }}</span>
            </button>
          </div>
        </template>
      </div>
      <p v-if="joinError" class="dialog-error">{{ joinError }}</p>
      <p v-if="sentenceFinal(sentence.id)" class="final-preview">{{ sentenceFinal(sentence.id) }}</p>
      <PixelButton class="final-add" variant="secondary" block @click="openFinal(sentence.id)">
        {{ t('analysis.finalTranslation') }}
      </PixelButton>
    </article>
  </PixelCard>

  <PixelDialog
    :open="segmentSentenceId !== null"
    placement="center"
    :title="t('analysis.splitWordsTitle')"
    :hide-close="segmentSaving"
    @close="closeSegment"
  >
    <p class="review-hint">{{ t('analysis.splitWordsHint') }}</p>
    <div :dir="sourceDir">
    <PixelInput
      v-model="segmentDraft"
      multiline
      :rows="4"
      :disabled="segmentSaving"
    >
      <template #suffix>
        <PixelButton
          class="segment-save"
          :class="{ 'segment-save--busy': segmentSaving }"
          square
          :disabled="segmentSaving || !segmentDraft.trim()"
          :aria-busy="segmentSaving"
          :aria-label="segmentSaving ? t('common.loading') : t('common.save')"
          @click="saveSegment"
        >
          <span v-if="segmentSaving" class="segment-save__spin" aria-hidden="true" />
          <svg v-else class="segment-save__check" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M3.2 8.2L6.4 11.4 12.8 4.6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </PixelButton>
      </template>
    </PixelInput>
    </div>
    <p v-if="segmentError" class="dialog-error">{{ segmentError }}</p>
  </PixelDialog>

  <FinalTranslationDialog
    :open="finalOpen"
    :proposals="openFinalProposals"
    :user-id="authorId"
    :source-text="openFinalSource"
    :source-dir="sourceDir"
    :translation-dir="targetDir"
    :saving="finalSaving"
    :error="finalError"
    @close="closeFinal"
    @change="onFinalChange"
  />

  <PixelDialog
    :open="constructionTarget !== null"
    placement="center"
    :title="constructionTitle"
    @close="closeConstruction"
  >
    <PixelInput v-model="constructionPhraseInput" :label="t('analysis.constructionInput')" />
    <PixelInput
      v-if="constructionUsesCharacters"
      class="dialog-gap"
      v-model="constructionFuriganaInput"
      :label="t('analysis.furiganaLabel')"
      :placeholder="t('analysis.optional')"
    />
    <p v-if="constructionError" class="dialog-error">{{ constructionError }}</p>
    <PixelButton class="dialog-gap" block :disabled="constructionSaving" @click="saveConstructionPhrase">
      {{ constructionSaving ? t('common.loading') : t('common.save') }}
    </PixelButton>
  </PixelDialog>

  <PixelDialog
    :open="openColumnId !== null"
    placement="center"
    :title="activeColumn()?.text ?? t('analysis.translationTitle')"
    highlight-title
    @close="closeWord"
  >
    <template v-if="active()">
      <template v-if="usesCharacterScript(active()!.language)">
        <PixelInput
          v-model="sourceKanji"
          :label="readingLabel('kanji', 'source')"
          :placeholder="t('analysis.optional')"
          :disabled="sourceKanjiLocked"
        />
        <PixelInput
          class="dialog-gap"
          v-model="sourceFurigana"
          :label="readingLabel('furigana', 'source')"
          :placeholder="t('analysis.optional')"
          :disabled="sourceFuriganaLocked"
        />
      </template>
      <TranslationChoices
        v-if="translationChoices.length"
        class="dialog-gap"
        v-model="translationId"
        :label="t('analysis.translationLabel')"
        :options="translationChoices"
        :like-label="t('texts.like')"
        :dislike-label="t('texts.dislike')"
        @vote="voteTranslation"
      />
      <PixelButton
        v-if="canDeleteTranslation"
        class="dialog-gap"
        variant="danger"
        block
        :disabled="saving"
        @click="deleteSelectedTranslation"
      >
        {{ t('analysis.deleteTranslation') }}
      </PixelButton>
      <PixelButton
        v-if="active()!.options.length && !addingTranslation"
        class="dialog-gap"
        variant="secondary"
        block
        :disabled="Boolean(translationBan)"
        @click="addingTranslation = true"
      >
        {{ t('analysis.addOtherTranslation') }}
      </PixelButton>
      <p v-if="translationBan" class="dialog-error">{{ translationBan }}</p>
      <div v-if="!active()!.options.length || addingTranslation" :dir="targetDir">
      <PixelInput
        class="dialog-gap"
        v-model="customTranslation"
        :label="active()!.options.length ? t('analysis.otherTranslation') : t('analysis.translationLabel')"
        :placeholder="scan.targetLanguage"
        :disabled="Boolean(translationBan)"
      />
      </div>
      <template v-if="usesCharacterScript(scan.targetLanguage)">
        <PixelInput
          class="dialog-gap"
          v-model="translationKanji"
          :label="readingLabel('kanji', 'translation')"
          :placeholder="t('analysis.optional')"
          :disabled="translationKanjiLocked"
        />
        <PixelInput
          class="dialog-gap"
          v-model="translationFurigana"
          :label="readingLabel('furigana', 'translation')"
          :placeholder="t('analysis.optional')"
          :disabled="translationFuriganaLocked"
        />
      </template>
      <p v-if="readingsLocked" class="dialog-note">{{ t('analysis.readingLocked') }}</p>

      <p v-if="active()!.roots.length" class="related">
        <span class="related__label">{{ t('analysis.rootsLabel') }}</span>
        {{ active()!.roots.map((option) => option.label).join(' · ') }}
      </p>
      <PixelButton
        v-if="!addingRoot"
        class="dialog-gap"
        variant="secondary"
        block
        @click="addingRoot = true"
      >
        {{ t('analysis.addRoot') }}
      </PixelButton>
      <PixelInput
        v-else
        class="dialog-gap"
        v-model="newRoot"
        :label="t('analysis.addRoot')"
        :placeholder="t('analysis.optional')"
      />

      <p v-if="active()!.constructions.length" class="related">
        <span class="related__label">{{ t('analysis.constructionsLabel') }}</span>
        {{ active()!.constructions.map((option) => option.label).join(' · ') }}
      </p>
      <PixelButton
        v-if="!addingConstruction"
        class="dialog-gap"
        variant="secondary"
        block
        @click="addingConstruction = true"
      >
        {{ t('analysis.addConstruction') }}
      </PixelButton>
      <PixelInput
        v-else
        class="dialog-gap"
        v-model="newConstruction"
        :label="t('analysis.addConstruction')"
        :placeholder="t('analysis.optional')"
      />

      <p v-if="dialogError" class="dialog-error">{{ dialogError }}</p>
      <PixelButton class="dialog-gap" block :disabled="saving" @click="saveWord">
        {{ t('common.save') }}
      </PixelButton>
    </template>
  </PixelDialog>
</template>

<style scoped>
.review-hint {
  margin: 0 0 1rem;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.5;
  color: var(--pixel-text-muted);
}

.sentence {
  margin-bottom: 1.1rem;
}

.columns {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.45rem 0.35rem;
}

.column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  max-width: 8rem;
}

.original {
  font-size: var(--pixel-font-size-xs);
  line-height: 1.6;
  text-align: center;
}

.original--split {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.segment-save {
  align-self: flex-start;
  height: 2.6rem;
  min-height: 2.6rem;
}

.segment-save__check {
  width: 1.15rem;
  height: 1.15rem;
  display: block;
}

.segment-save--busy {
  cursor: wait;
}

.segment-save__spin {
  width: 1rem;
  height: 1rem;
  border: 2px solid color-mix(in srgb, var(--pixel-on-accent) 32%, transparent);
  border-top-color: var(--pixel-on-accent);
  border-radius: 50%;
  animation: segment-spin 0.7s linear infinite;
}

@keyframes segment-spin {
  to {
    transform: rotate(360deg);
  }
}

.original--pick {
  padding: 0.15rem 0.25rem;
  border: var(--pixel-border-width) solid transparent;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.original--picked {
  border-color: var(--pixel-accent);
  background: color-mix(in srgb, var(--pixel-accent) 18%, transparent);
}

.stack,
.stack-saved,
.stack-hint {
  margin: 0.55rem 0 0;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.5;
}

.stack__surface {
  margin: 0 0 0.35rem;
}

.stack-saved {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  color: var(--pixel-accent);
}

.stack-hint {
  color: var(--pixel-text-muted);
}

.glue {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  max-width: 100%;
}

.glue__words {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: max-content;
  align-items: end;
  justify-content: start;
  gap: 0.35rem;
}

.glue__frame {
  display: flex;
  align-items: stretch;
  width: 100%;
  border: var(--pixel-border-width) solid var(--pixel-success);
  background: var(--pixel-bg);
  color: var(--pixel-success);
}

.glue__frame--empty {
  border-style: dashed;
  border-color: var(--pixel-accent);
  color: var(--pixel-text-muted);
}

.glue__frame--target,
.translation--target {
  outline: 2px solid var(--pixel-success);
  outline-offset: 2px;
}

.glue__label {
  flex: 1;
  min-width: 0;
  padding: 0.85rem 0.45rem 0.3rem;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.45;
  text-align: center;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.glue__split {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  padding: 0;
  border: none;
  border-left: var(--pixel-border-width) solid currentColor;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.glue__frame--empty .glue__split {
  border-left-style: dashed;
}

.glue__split svg {
  width: 1rem;
  height: 1rem;
  display: block;
}

.original--construction {
  color: var(--pixel-success);
}

.translation--dragging {
  opacity: 0.55;
}

.original :deep(rt),
.translation :deep(rt) {
  font-size: var(--pixel-font-size-xs);
}

.translation {
  border: var(--pixel-border-width) solid var(--pixel-accent);
  background: var(--pixel-bg);
  color: var(--pixel-text);
  font: inherit;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.2;
  padding: 0.85rem 0.45rem 0.3rem;
  cursor: pointer;
  text-align: center;
  touch-action: none;
  user-select: none;
}

.translation--empty {
  border-style: dashed;
  color: var(--pixel-text-muted);
}

.translation--frozen {
  display: inline-block;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.translation--locked {
  display: inline-block;
  cursor: default;
}

.final-add {
  margin-top: 0.75rem;
}

.final-preview {
  margin: 0.65rem 0 0;
  white-space: pre-wrap;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.45;
}

.related {
  margin: 0.65rem 0 0;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.5;
}

.related__label {
  display: block;
  margin-bottom: 0.25rem;
  color: var(--pixel-text-muted);
}

.dialog-gap {
  margin-top: 0.65rem;
}

.dialog-note {
  margin: 0.75rem 0 0;
  color: var(--pixel-text-muted);
  font-size: var(--pixel-font-size-xs);
  line-height: 1.5;
}

.dialog-error {
  margin: 0.5rem 0 0;
  color: var(--pixel-danger);
  font-size: var(--pixel-font-size-xs);
}
</style>
