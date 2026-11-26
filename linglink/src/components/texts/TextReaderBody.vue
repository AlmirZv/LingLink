<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import TextComments from '@/components/texts/TextComments.vue'
import TextIconButton from '@/components/texts/TextIconButton.vue'
import WordGlyph from '@/components/words/WordGlyph.vue'
import PixelButton from '@/components/ui/PixelButton.vue'
import PixelCard from '@/components/ui/PixelCard.vue'
import { rememberLibraryReturn, scrollToLibraryCard } from '@/composables/useLibraryReturn'
import { useLanguageContext } from '@/composables/useLanguageContext'
import { useMasteredWords } from '@/composables/useMasteredWords'
import { useReadingReveal } from '@/composables/useReadingReveal'
import { useRepositories } from '@/composables/useRepositories'
import { applyTextEngagement, setTextCommentCount, useTextEngagement } from '@/composables/useTextEngagement'
import {
  currentReadingWindow,
  rankReadingWords,
  renderFinalReadingText,
  renderReadingText,
  revealedReadingWords,
  textHasFinalTranslations,
  type ReadingFocusWord,
  type ReadingHint,
  type ReadingPiece,
} from '@/domain/text/readingFocus'
import { textDirection } from '@/constants/languages'
import { isOriginalLearningText } from '@/domain/learning/readingLanguageModel'
import { isConstructionMastered } from '@/domain/words/constructionMastery'
import {
  awardReadingMastery,
  readingPracticeTargets,
  recordReadingTextProgress,
  resetReadingTextProgress,
} from '@/services/awardReadingMastery'
import { useSessionStore } from '@/stores/session'
import type { GrammarConstruction, ID, LearningText } from '@/types/db'

const props = withDefaults(
  defineProps<{
    text: LearningText
    variant?: 'page' | 'card'
  }>(),
  { variant: 'page' },
)

const emit = defineEmits<{
  'update:text': [LearningText]
  progress: [number]
}>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const repos = useRepositories()
const { knownLanguage, learningLanguage, translationTargetForText } = useLanguageContext()
const { masteredWordIds, masteryByWordId, wordsById, ready: wordsReady, reload: reloadMastered } =
  useMasteredWords()

const current = ref(props.text)
watch(
  () => props.text,
  (value) => {
    current.value = value
  },
)

const textId = computed(() => current.value.id)
const {
  revealedCount,
  awardedIds,
  finished,
  showFinals,
  revealMore,
  noteAwarded,
  markFinished,
  markFinalsShown,
  restart,
} = useReadingReveal(textId)

const advancing = ref(false)
const liking = ref(false)
const liked = ref(false)
const disliked = ref(false)
const saved = ref(false)
const viewedKey = ref('')
const commentsOpen = ref(false)
const { likes, comments: commentCount } = useTextEngagement(() => current.value)
const ranked = shallowRef<ReadingFocusWord[]>([])
const rankedFor = ref('')
const constructionsById = shallowRef<Map<ID, GrammarConstruction>>(new Map())
const constructionsFor = ref('')
const masteredConstructionIds = computed(() => {
  const ids = new Set<ID>()
  for (const construction of constructionsById.value.values()) {
    if (isConstructionMastered(construction, masteryByWordId.value)) ids.add(construction.id)
  }
  return ids
})

const isAuthor = computed(
  () => Boolean(session.user?.id && current.value.authorId === session.user.id),
)
const card = computed(() => props.variant === 'card')

watch(
  () => (wordsReady.value ? `${current.value.id}:${wordsById.value.size}` : ''),
  (key) => {
    if (!key) return
    const source = current.value
    const ids = new Set<ID>()
    for (const sentence of source.sentences) {
      for (const occurrence of sentence.constructions) ids.add(occurrence.constructionId)
      for (const occurrence of sentence.words) {
        const word = occurrence.wordId ? wordsById.value.get(occurrence.wordId) : undefined
        for (const id of word?.grammarConstructions ?? []) ids.add(id)
      }
    }
    void Promise.all([...ids].map((id) => repos.constructions.getById(id)))
      .then((rows) => {
        if (current.value.id !== source.id) return
        constructionsById.value = new Map(rows.flatMap((row) => (row ? [[row.id, row] as const] : [])))
        constructionsFor.value = source.id
      })
      .catch(() => {
        if (current.value.id !== source.id) return
        constructionsById.value = new Map()
        constructionsFor.value = source.id
      })
  },
  { immediate: true },
)

watch(
  () =>
    wordsReady.value && constructionsFor.value === current.value.id
      ? {
          id: current.value.id,
          text: current.value,
          words: wordsById.value,
          mastered: masteredWordIds.value,
          constructions: constructionsById.value,
          masteredConstructions: masteredConstructionIds.value,
          learning: learningLanguage.value,
          known: knownLanguage.value,
        }
      : null,
  (state) => {
    if (!state) return
    const key = `${state.id}:${learningLanguage.value}:${knownLanguage.value}:${[...state.mastered].sort().join(',')}:${[...state.masteredConstructions].sort().join(',')}`
    if (rankedFor.value === key) return
    ranked.value = rankReadingWords(
      state.text,
      state.words,
      state.mastered,
      learningLanguage.value,
      state.constructions,
      state.masteredConstructions,
      knownLanguage.value,
    )
    rankedFor.value = key
  },
  { immediate: true },
)

const originalReading = computed(() =>
  isOriginalLearningText(current.value.language, knownLanguage.value, learningLanguage.value),
)
const readingDir = computed(() => textDirection(current.value.language))
const finalTargetLanguage = computed(() => translationTargetForText(current.value.language))
const hasFinals = computed(() => textHasFinalTranslations(current.value, finalTargetLanguage.value))
const canShowFinals = computed(
  () =>
    !originalReading.value &&
    hasFinals.value &&
    !showFinals.value &&
    revealedCount.value >= ranked.value.length,
)
const legend = computed(() =>
  originalReading.value || showFinals.value
    ? []
    : currentReadingWindow(ranked.value, revealedCount.value),
)
const studyWordIds = computed(
  () =>
    new Set(
      revealedReadingWords(ranked.value, revealedCount.value).flatMap((item) =>
        item.members.map((member) => member.learningWord.id),
      ),
    ),
)
const pieces = computed(() => {
  if (!wordsReady.value) return []
  if (showFinals.value && !originalReading.value) {
    return renderFinalReadingText(current.value, finalTargetLanguage.value)
  }
  return renderReadingText(
    current.value,
    wordsById.value,
    masteredWordIds.value,
    studyWordIds.value,
    learningLanguage.value,
    constructionsById.value,
    knownLanguage.value,
    masteredConstructionIds.value,
  )
})
const canRevealMore = computed(() => revealedCount.value < ranked.value.length)
const studiedCount = computed(() => awardedIds.value.length)
const ready = computed(() => wordsReady.value && constructionsFor.value === current.value.id)
const finishedMessage = computed(() => t('learning.finished', { n: studiedCount.value }, studiedCount.value))
const readingCta = computed(() => {
  if (finished.value) return t('learning.startOver')
  if (canRevealMore.value || canShowFinals.value) return t('learning.nextWords')
  return t('learning.done')
})

function pieceClass(kind: ReadingPiece['kind']) {
  if (kind === 'known') return 'piece piece--known'
  if (kind === 'study') return 'piece piece--study'
  return undefined
}

interface OpenHint extends ReadingHint {
  key: number
  top: number
  left: number
}

const hint = ref<OpenHint | null>(null)
const hintEl = ref<HTMLElement | null>(null)
let ignoreNextHit = false

function placeHint(anchor: DOMRect) {
  const el = hintEl.value
  const open = hint.value
  if (!el || !open) return
  const box = el.getBoundingClientRect()
  const margin = 8
  const nav = 4.5 * 16 + margin
  let top = anchor.bottom + margin
  if (top + box.height > window.innerHeight - nav) top = Math.max(margin, anchor.top - box.height - margin)
  let left = anchor.left
  if (left + box.width > window.innerWidth - margin) left = window.innerWidth - margin - box.width
  if (left < margin) left = margin
  hint.value = { ...open, top, left }
}

function openHint(index: number, piece: ReadingPiece, event: MouseEvent) {
  if (ignoreNextHit) {
    ignoreNextHit = false
    return
  }
  if (!piece.hint) return
  if (hint.value?.key === index) {
    hint.value = null
    return
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  hint.value = {
    key: index,
    translation: piece.hint.translation,
    furigana: piece.hint.furigana,
    translationFurigana: piece.hint.translationFurigana,
    top: rect.bottom + 8,
    left: Math.max(8, rect.left),
  }
  void nextTick(() => placeHint(rect))
}

function onPointerDown(event: PointerEvent) {
  if (!hint.value) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (hintEl.value?.contains(target)) return
  const hit = target instanceof Element ? target.closest('.piece-hit') : null
  if (hit instanceof HTMLElement && Number(hit.dataset.hintKey) !== hint.value.key) return
  if (hit instanceof HTMLElement) ignoreNextHit = true
  hint.value = null
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
})

watch(pieces, () => {
  hint.value = null
})

watch(
  () =>
    session.user?.id && current.value.status !== 'draft'
      ? `${session.user.id}:${current.value.id}`
      : '',
  (key) => {
    const source = current.value
    const userId = session.user?.id
    if (!key || !userId || viewedKey.value === key) return
    viewedKey.value = key
    void repos.texts.recordView(userId, source.id).then((updated) => {
      if (updated && current.value.id === updated.id) {
        current.value = updated
        applyTextEngagement(updated)
        emit('update:text', updated)
      }
    })
    void Promise.all([
      repos.texts.isLiked(userId, source.id),
      repos.texts.isDisliked(userId, source.id),
      repos.texts.isSaved(userId, source.id),
    ]).then(([like, dislike, bookmark]) => {
      if (current.value.id !== source.id) return
      liked.value = like
      disliked.value = dislike
      saved.value = bookmark
    })
  },
  { immediate: true },
)

async function advanceReading() {
  const source = current.value
  const userId = session.user?.id
  if (!userId || advancing.value || finished.value) return
  if (card.value) scrollToLibraryCard(source.id)
  const batch = legend.value
    .flatMap((item) => item.members.map((member) => member.learningWord.id))
    .filter((id) => !awardedIds.value.includes(id))
  const moreRemain = canRevealMore.value
  advancing.value = true
  try {
    const practice = readingPracticeTargets(batch, constructionsById.value)
    await awardReadingMastery(repos, userId, source.id, practice.masteryWordIds)
    await recordReadingTextProgress(
      repos,
      userId,
      source,
      practice.learnedWordIds,
      practice.learnedConstructionIds,
    )
    noteAwarded(batch)
    if (moreRemain) revealMore(ranked.value.length)
    else if (canShowFinals.value) markFinalsShown()
    else markFinished()
    await reloadMastered()
  } finally {
    advancing.value = false
  }
}

async function restartReading() {
  const source = current.value
  const userId = session.user?.id
  if (!userId || advancing.value || !finished.value) return
  if (card.value) scrollToLibraryCard(source.id)
  advancing.value = true
  try {
    await resetReadingTextProgress(repos, userId, source)
    restart()
    emit('progress', 0)
  } finally {
    advancing.value = false
  }
}

function onReadingCta() {
  if (finished.value) void restartReading()
  else void advanceReading()
}

async function toggleLike() {
  const source = current.value
  const userId = session.user?.id
  if (!userId || liking.value) return
  liking.value = true
  try {
    const result = await repos.texts.toggleLike(userId, source.id)
    if (!result || current.value.id !== source.id) return
    liked.value = result.liked
    disliked.value = result.disliked
    current.value = result.text
    applyTextEngagement(result.text)
    emit('update:text', result.text)
  } finally {
    liking.value = false
  }
}

async function toggleDislike() {
  const source = current.value
  const userId = session.user?.id
  if (!userId || liking.value) return
  liking.value = true
  try {
    const result = await repos.texts.toggleDislike(userId, source.id)
    if (!result || current.value.id !== source.id) return
    liked.value = result.liked
    disliked.value = result.disliked
    current.value = result.text
    applyTextEngagement(result.text)
    emit('update:text', result.text)
  } finally {
    liking.value = false
  }
}

function openSupplement() {
  rememberLibraryReturn(current.value.id, route)
  void router.push({ name: 'text-supplement', params: { id: current.value.id } })
}

async function toggleSaved() {
  const source = current.value
  const userId = session.user?.id
  if (!userId || liking.value) return
  liking.value = true
  try {
    saved.value = await repos.texts.toggleSaved(userId, source.id)
  } finally {
    liking.value = false
  }
}

defineExpose({
  closeComments() {
    commentsOpen.value = false
  },
})
</script>

<template>
  <div class="reader" :class="{ 'reader--card': card }">
    <p v-if="!ready" class="pixel-text-muted">{{ t('common.loading') }}</p>
    <template v-else>
      <section v-if="!originalReading && card && (legend.length || finished)" class="focus-card">
        <h3 v-if="legend.length" class="focus-heading">{{ t('learning.newWords') }}</h3>
        <ul v-if="legend.length" class="focus">
          <li v-for="item in legend" :key="item.learningWord.id">
            <span
              v-for="member in item.members"
              :key="`${member.learningWord.id}:${member.original}`"
              class="focus-member"
            >
              <WordGlyph class="focus-word" :word="member.learningWord" />
              <span class="focus-original">{{ member.original }}</span>
            </span>
          </li>
        </ul>
        <button
          type="button"
          class="words-cta"
          :disabled="advancing"
          @click="onReadingCta"
        >
          {{ readingCta }}
        </button>
      </section>
      <PixelCard v-else-if="!originalReading && legend.length" class="focus-card" :title="t('learning.newWords')">
        <ul class="focus">
          <li v-for="item in legend" :key="item.learningWord.id">
            <span
              v-for="member in item.members"
              :key="`${member.learningWord.id}:${member.original}`"
              class="focus-member"
            >
              <WordGlyph class="focus-word" :word="member.learningWord" />
              <span class="focus-original">{{ member.original }}</span>
            </span>
          </li>
        </ul>
      </PixelCard>

      <p v-if="card" class="body" :dir="readingDir">
        <template v-for="(piece, index) in pieces" :key="index">
          <button
            v-if="piece.hint"
            type="button"
            class="piece-hit"
            :class="pieceClass(piece.kind)"
            :data-hint-key="index"
            :aria-expanded="hint?.key === index"
            @click="openHint(index, piece, $event)"
          >
            {{ piece.text }}
          </button>
          <span v-else :class="pieceClass(piece.kind)">{{ piece.text }}</span>
        </template>
      </p>
      <PixelCard v-else>
        <p class="body" :dir="readingDir">
          <template v-for="(piece, index) in pieces" :key="index">
            <button
              v-if="piece.hint"
              type="button"
              class="piece-hit"
              :class="pieceClass(piece.kind)"
              :data-hint-key="index"
              :aria-expanded="hint?.key === index"
              @click="openHint(index, piece, $event)"
            >
              {{ piece.text }}
            </button>
            <span v-else :class="pieceClass(piece.kind)">{{ piece.text }}</span>
          </template>
        </p>
      </PixelCard>

      <div class="actions">
        <p v-if="finished && !originalReading" class="done-message">{{ finishedMessage }}</p>
        <PixelButton v-if="!card && !originalReading" block :disabled="advancing" @click="onReadingCta">
          {{ readingCta }}
        </PixelButton>
        <div class="icon-bar">
          <TextIconButton
            v-if="card"
            name="edit"
            :label="t('texts.supplement')"
            :caption="t('texts.openTranslation')"
            @click="openSupplement"
          />
          <TextIconButton
            v-if="card"
            name="comment"
            :active="commentsOpen"
            :count="commentCount"
            :label="t('texts.comments')"
            @click="commentsOpen = !commentsOpen"
          />
          <TextIconButton
            v-if="!isAuthor"
            name="like"
            tone="like"
            :active="liked"
            :count="likes"
            :disabled="liking"
            :label="liked ? t('texts.liked') : t('texts.like')"
            @click="toggleLike"
          />
          <TextIconButton
            v-if="!isAuthor"
            name="dislike"
            tone="dislike"
            :active="disliked"
            :count="current.dislikesCount ?? 0"
            :disabled="liking"
            :label="t('texts.dislike')"
            @click="toggleDislike"
          />
          <TextIconButton
            v-if="!isAuthor"
            name="save"
            tone="like"
            :active="saved"
            :disabled="liking"
            :label="saved ? t('texts.saved') : t('texts.save')"
            @click="toggleSaved"
          />
        </div>
        <div v-if="$slots['extra-actions']" class="extra-actions">
          <slot name="extra-actions" />
        </div>
      </div>

      <TextComments
        v-show="!card || commentsOpen"
        :text-id="current.id"
        @count="setTextCommentCount(current.id, $event)"
      />
    </template>

    <Teleport to="body">
      <div
        v-if="hint"
        ref="hintEl"
        class="hint pixel-box"
        dir="auto"
        role="dialog"
        :style="{ top: `${hint.top}px`, left: `${hint.left}px` }"
        @click.stop
      >
        <p v-if="hint.furigana" class="hint__reading">{{ hint.furigana }}</p>
        <WordGlyph
          v-if="hint.translation && hint.translationFurigana"
          class="hint__translation"
          :word="{ word: hint.translation, furigana: hint.translationFurigana }"
        />
        <p v-else-if="hint.translation" class="hint__translation">{{ hint.translation }}</p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.reader {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.reader--card {
  gap: 0.7rem;
}

.focus-card {
  padding: 0.65rem 0.75rem 0.7rem;
}

.reader--card .focus-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.25rem;
  padding: 0.45rem 0 0.5rem;
  border-top: 1px solid var(--pixel-border);
  border-bottom: 1px solid var(--pixel-border);
}

.focus-card :deep(.pixel-card__header) {
  margin-bottom: 0.15rem;
}

.focus-card :deep(.pixel-card__title) {
  margin: 0;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.4;
  color: var(--pixel-text-muted);
}

.focus-heading {
  margin: 0 0 0.25rem;
  font-size: 0.7rem;
  font-weight: normal;
  letter-spacing: 0.02em;
  color: var(--pixel-text-muted);
}

.reader--card .focus-heading {
  margin: 0;
}

.focus {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.45rem 0.85rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.reader--card .focus {
  align-items: baseline;
  gap: 0 0.15rem;
}

.focus li {
  margin: 0;
  padding-top: 1rem;
  font-size: 1rem;
  line-height: 1.35;
}

.reader--card .focus li {
  display: inline-flex;
  align-items: baseline;
  padding-top: 0.55rem;
  font-size: 0.8rem;
  line-height: 1.2;
}

.reader--card .focus li + li::before {
  content: '·';
  margin: 0 0.4rem 0 0.25rem;
  color: var(--pixel-text-muted);
}

.focus-member {
  display: inline;
}

.focus-member + .focus-member {
  margin-left: 0.45rem;
}

.reader--card .focus-member + .focus-member {
  margin-left: 0.28rem;
}

.focus-word {
  color: var(--pixel-study);
}

.focus-original {
  color: var(--pixel-text-muted);
}

.focus-original::before {
  content: '–';
  margin: 0 0.28rem;
}

.reader--card .focus-original::before {
  margin: 0 0.16rem;
}

.body {
  margin: 0;
  font-size: 1.125rem;
  line-height: 1.85;
}

.reader--card .body {
  font-size: 1.05rem;
  line-height: 1.75;
  padding-top: 0.55rem;
  border-top: 1px solid var(--pixel-border);
}

.reader--card .focus-card + .body {
  border-top: none;
  padding-top: 0.5rem;
}

.done-message {
  margin: 0;
  font-size: 1rem;
  line-height: 1.6;
  color: var(--pixel-success);
}

.piece--known {
  color: var(--pixel-success);
}

.piece--study {
  color: var(--pixel-study);
}

.piece-hit {
  font: inherit;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  line-height: inherit;
}

.hint {
  position: fixed;
  z-index: 30;
  max-width: min(18rem, calc(100vw - 1rem));
  padding: 0.55rem 0.65rem;
  font-size: 1rem;
  line-height: 1.45;
}

.hint__reading,
.hint__translation {
  margin: 0;
}

.hint__reading {
  margin-bottom: 0.35rem;
  color: var(--pixel-text-muted);
}

.hint__reading + .hint__translation {
  display: block;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.reader--card .actions {
  gap: 0.4rem;
  padding-top: 0.55rem;
  border-top: 1px solid var(--pixel-border);
}

.icon-bar,
.extra-actions {
  display: flex;
  flex-wrap: nowrap;
  justify-content: flex-end;
  align-items: center;
  gap: 0.3rem;
}

.icon-bar :deep(.icon-btn),
.extra-actions :deep(.icon-btn),
.extra-actions :deep(.pixel-btn) {
  flex-shrink: 0;
}

.reader--card .icon-bar :deep(.icon-btn) {
  min-width: 1.9rem;
  height: 1.9rem;
}

.reader--card .icon-bar :deep(.icon-btn--caption) {
  min-width: 0;
  padding: 0 0.55rem;
}

.words-cta {
  align-self: flex-end;
  height: 2rem;
  padding: 0 0.85rem;
  border: 1px solid var(--pixel-border);
  border-radius: var(--pixel-radius-pill);
  background: var(--pixel-bg);
  color: var(--pixel-text);
  box-shadow: none;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

.words-cta:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
