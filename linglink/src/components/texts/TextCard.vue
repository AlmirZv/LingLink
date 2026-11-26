<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import TextMetrics from '@/components/texts/TextMetrics.vue'
import TextReaderBody from '@/components/texts/TextReaderBody.vue'
import PixelCard from '@/components/ui/PixelCard.vue'
import PixelSelect from '@/components/ui/PixelSelect.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import {
  requestLibraryTextCard,
  scrollToLibraryCard,
  shouldExpandLibraryCard,
  watchLibraryTextCard,
} from '@/composables/useLibraryReturn'
import { useLanguageContext } from '@/composables/useLanguageContext'
import { useMasteredWords } from '@/composables/useMasteredWords'
import { useRepositories } from '@/composables/useRepositories'
import { useTextEngagement } from '@/composables/useTextEngagement'
import { textDirection } from '@/constants/languages'
import { librarySnippet } from '@/domain/text/librarySnippet'
import { isConstructionMastered } from '@/domain/words/constructionMastery'
import { computeTranslationProgress } from '@/services/textDenormalize'
import type { GrammarConstruction, ID, LearningText } from '@/types/db'

const authorNames = new Map<ID, string>()
const authorLoads = new Map<ID, Promise<string>>()

const props = defineProps<{
  text: LearningText
  userProgress?: number
}>()

const emit = defineEmits<{
  progress: [number]
}>()

const localProgress = ref<number | null>(null)
watch(
  () => props.userProgress,
  () => {
    localProgress.value = null
  },
)

const { t, locale } = useI18n()
const router = useRouter()
const repos = useRepositories()
const { knownLanguage, learningLanguage } = useLanguageContext()
const { masteryByWordId, wordsById } = useMasteredWords()
const authorName = ref('')
const expanded = ref(shouldExpandLibraryCard(props.text.id))
const current = ref(props.text)
const reader = ref<{ closeComments?: () => void } | null>(null)
const constructionsById = shallowRef<Map<ID, GrammarConstruction>>(new Map())

watch(
  () => props.text,
  (value) => {
    current.value = value
  },
)

function constructionIdsOf(text: LearningText): ID[] {
  const ids = new Set<ID>(text.constructionIds)
  for (const sentence of text.sentences) {
    for (const item of sentence.constructions) {
      if (item.constructionId) ids.add(item.constructionId)
    }
  }
  return [...ids]
}

function authorLabel(authorId: ID): Promise<string> {
  const known = authorNames.get(authorId)
  if (known) return Promise.resolve(known)
  const pending = authorLoads.get(authorId)
  if (pending) return pending
  const load = repos.users.getById(authorId).then((user) => {
    const name = user?.displayName ?? authorId
    authorNames.set(authorId, name)
    return name
  })
  authorLoads.set(authorId, load)
  return load
}

const masteredConstructionIds = computed(() => {
  const ids = new Set<ID>()
  for (const construction of constructionsById.value.values()) {
    if (isConstructionMastered(construction, masteryByWordId.value)) ids.add(construction.id)
  }
  return ids
})
const previewKnownWordIds = computed(() => {
  const ids = new Set<ID>()
  for (const [id, count] of masteryByWordId.value) {
    if (count >= 1) ids.add(id)
  }
  return ids
})
const previewKnownConstructionIds = computed(() => {
  const ids = new Set<ID>(masteredConstructionIds.value)
  for (const [id, count] of masteryByWordId.value) {
    if (count >= 1) ids.add(id)
  }
  for (const construction of constructionsById.value.values()) {
    const parts = construction.wordIds?.length ? construction.wordIds : construction.relatedWords
    if (parts.length && parts.every((id) => (masteryByWordId.value.get(id) ?? 0) >= 1)) {
      ids.add(construction.id)
    }
  }
  return ids
})
const snippet = computed(() =>
  librarySnippet(
    current.value,
    wordsById.value,
    previewKnownWordIds.value,
    learningLanguage.value,
    constructionsById.value,
    previewKnownConstructionIds.value,
    knownLanguage.value,
  ),
)
const translationPercent = computed(() => Math.round(computeTranslationProgress(current.value) * 100))
const yourPercent = computed(() => Math.round((localProgress.value ?? props.userProgress ?? 0) * 100))

function onReaderProgress(value: number) {
  localProgress.value = value
  emit('progress', value)
}
const { views, likes, comments, edits } = useTextEngagement(() => current.value)
const publishedAtLabel = computed(() => {
  const stamp = current.value.createdAt
  if (typeof stamp !== 'string' || !stamp) return ''
  const date = new Date(stamp)
  if (Number.isNaN(date.getTime())) return stamp
  return date.toLocaleDateString(locale.value, { dateStyle: 'medium' })
})

watch(
  () => constructionIdsOf(current.value).join('\n'),
  (key) => {
    const ids = key ? key.split('\n') : []
    const currentId = current.value.id
    void Promise.all(ids.map((id) => repos.constructions.getById(id))).then((rows) => {
      if (current.value.id !== currentId) return
      constructionsById.value = new Map(rows.flatMap((row) => (row ? [[row.id, row] as const] : [])))
    })
  },
  { immediate: true },
)

watch(
  () => current.value.authorId,
  (authorId) => {
    void authorLabel(authorId).then((name) => {
      if (current.value.authorId === authorId) authorName.value = name
    })
  },
  { immediate: true },
)

const titleClip = ref<HTMLElement | null>(null)
const titleText = ref<HTMLElement | null>(null)
const titleOverflow = ref(0)
let titleResize: ResizeObserver | null = null

function measureTitle() {
  const clip = titleClip.value
  const text = titleText.value
  if (!clip || !text) {
    titleOverflow.value = 0
    return
  }
  titleOverflow.value = Math.max(0, Math.ceil(text.scrollWidth - clip.clientWidth))
}

const titleScrollSeconds = computed(() => {
  if (titleOverflow.value <= 0) return 0
  return Math.max(4, titleOverflow.value / 28)
})

const seriesOptions = ref<{ value: string; label: string }[]>([])

watch(
  () => (expanded.value ? current.value.seriesId ?? '' : ''),
  (seriesId) => {
    if (!seriesId) {
      seriesOptions.value = []
      return
    }
    const textId = current.value.id
    void repos.series.getById(seriesId).then(async (series) => {
      if (!series || current.value.id !== textId) return
      const rows = await Promise.all(series.textIds.map((id) => repos.texts.getById(id)))
      if (current.value.id !== textId) return
      seriesOptions.value = series.textIds.flatMap((id, index) => {
        const text = rows[index]
        if (!text || text.status === 'draft') return []
        return [{ value: text.id, label: text.title || text.id }]
      })
    })
  },
  { immediate: true },
)

watchLibraryTextCard(
  () => current.value.id,
  (open) => {
    expanded.value = open
    if (!open) reader.value?.closeComments?.()
  },
)

function expand() {
  expanded.value = true
}

function collapse() {
  expanded.value = false
  reader.value?.closeComments?.()
  void nextTick(() => {
    requestAnimationFrame(() => {
      scrollToLibraryCard(current.value.id)
    })
  })
}

function onSeriesText(id: string) {
  if (!id || id === current.value.id) return
  reader.value?.closeComments?.()
  requestLibraryTextCard(id)
  void nextTick(() => {
    requestAnimationFrame(() => {
      if (!scrollToLibraryCard(id)) {
        void router.push({ name: 'text-preview', params: { id } })
      }
    })
  })
}

function onCardClick(event: MouseEvent) {
  if (expanded.value) return
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('button, a')) return
  expand()
}

onMounted(() => {
  titleResize = new ResizeObserver(() => measureTitle())
  if (titleClip.value) titleResize.observe(titleClip.value)
  if (titleText.value) titleResize.observe(titleText.value)
  void nextTick(measureTitle)
})

onBeforeUnmount(() => {
  titleResize?.disconnect()
})

watch(
  () => current.value.title,
  () => {
    void nextTick(measureTitle)
  },
)
</script>

<template>
  <PixelCard
    class="text-card"
    :class="{ 'text-card--open': expanded }"
    :data-library-text-id="current.id"
    @click="onCardClick"
  >
    <header class="card-head">
      <div class="card-top">
        <div ref="titleClip" class="title-clip">
          <h2
            ref="titleText"
            class="card-title"
            :class="{ 'card-title--scroll': titleOverflow > 0 }"
            :style="{
              '--title-overflow': `${titleOverflow}px`,
              '--title-scroll-seconds': `${titleScrollSeconds}s`,
            }"
          >
            {{ current.title }}
          </h2>
        </div>
        <div class="card-stats">
          <ProgressRing
            kind="translation"
            :value="translationPercent"
            :label="t('home.translationProgress')"
          />
          <ProgressRing kind="progress" :value="yourPercent" :label="t('home.yourProgress')" />
          <TextMetrics :views="views" :likes="likes" :edits="edits" :comments="comments" />
        </div>
      </div>
    </header>

    <template v-if="!expanded">
      <p v-if="snippet.length" class="snippet" :dir="textDirection(current.language)">
        <span
          v-for="(piece, index) in snippet"
          :key="index"
          :class="{ snippet__word: piece.translated }"
        >{{ piece.text }}</span>
      </p>
    </template>
    <TextReaderBody
      v-else
      ref="reader"
      variant="card"
      :text="current"
      @update:text="current = $event"
      @progress="onReaderProgress"
    />

    <PixelSelect
      v-if="expanded && seriesOptions.length > 1"
      class="series-switch"
      inline
      :model-value="current.id"
      :label="t('texts.seriesTexts')"
      :options="seriesOptions"
      @click.stop
      @update:model-value="onSeriesText"
    />
    <div class="card-foot">
      <p v-if="authorName || publishedAtLabel" class="origin pixel-text-muted">
        {{ authorName }}<template v-if="authorName && publishedAtLabel"> · </template>{{ publishedAtLabel }}
      </p>
      <span v-else class="card-foot__spacer" />
      <button v-if="!expanded" type="button" class="toggle" @click.stop="expand">
        {{ t('texts.expand') }}
      </button>
      <button v-else type="button" class="toggle" @click.stop="collapse">
        {{ t('texts.collapse') }}
      </button>
    </div>
  </PixelCard>
</template>

<style scoped>
.text-card {
  cursor: pointer;
}

.text-card--open {
  cursor: default;
}

.text-card :deep(.pixel-card__body) {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.card-head {
  display: flex;
  flex-direction: column;
}

.card-top {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.55rem;
}

.title-clip {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}

.card-title {
  margin: 0;
  width: max-content;
  max-width: none;
  font-size: 1.12rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.3;
  white-space: nowrap;
}

.card-title--scroll {
  animation: title-marquee var(--title-scroll-seconds) ease-in-out infinite alternate;
}

.origin {
  margin: 0;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.7rem;
  line-height: 1.3;
}

.card-stats {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.4rem;
  flex: 0 0 auto;
}

.card-stats :deep(.ring),
.card-stats :deep(.metric__icon) {
  width: 1.1rem;
  height: 1.1rem;
}

.card-stats :deep(.metrics) {
  gap: 0.4rem;
  font-size: 0.65rem;
}

.snippet {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
  margin: 0;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.55;
}

.snippet__word {
  color: var(--pixel-study);
}

.card-foot {
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.5rem;
}

.card-foot__spacer {
  flex: 1;
}

.text-card--open .card-foot {
  padding-top: 0.15rem;
}

.series-switch {
  align-self: flex-end;
  width: max-content;
  max-width: 100%;
}

.series-switch :deep(.pixel-field__label) {
  font-size: 0.8rem;
  color: var(--pixel-text);
}

.series-switch :deep(.pixel-field__row) {
  flex: 0 1 auto;
}

.series-switch :deep(.pixel-field__select) {
  width: auto;
  min-width: 7.5rem;
  max-width: 12.5rem;
  height: 2rem;
  padding: 0 1.7rem 0 0.85rem;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1;
  border-radius: var(--pixel-radius-pill);
  background-position:
    calc(100% - 0.85rem) calc(50% + 2px),
    calc(100% - 0.55rem) calc(50% + 2px);
}

.toggle {
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

.toggle:not(:disabled):active {
  filter: var(--pixel-press-filter);
}

@keyframes title-marquee {
  0%,
  18% {
    transform: translateX(0);
  }
  82%,
  100% {
    transform: translateX(calc(-1 * var(--title-overflow, 0px)));
  }
}

@media (prefers-reduced-motion: reduce) {
  .card-title--scroll {
    animation: none;
  }
}
</style>
