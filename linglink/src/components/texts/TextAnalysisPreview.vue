<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TextAnalysisResult, Token } from '@/types/analysis'
import PixelCard from '@/components/ui/PixelCard.vue'

const props = defineProps<{
  analysis: TextAnalysisResult
}>()

const { t } = useI18n()

const stats = computed(() => props.analysis.statistics)

const knownNormalized = computed(
  () => new Set(props.analysis.words.filter((w) => w.known).map((w) => w.normalized)),
)

function tokenClass(token: Token): string {
  if (token.type !== 'word') return 'token token--punct'
  return knownNormalized.value.has(token.normalized) ? 'token token--known' : 'token token--unknown'
}
</script>

<template>
  <PixelCard :title="t('analysis.previewTitle')" :subtitle="analysis.language.toUpperCase()">
    <ul class="stats">
      <li>{{ t('analysis.sentences') }}: {{ stats.sentenceCount }}</li>
      <li>{{ t('analysis.totalWords') }}: {{ stats.totalWordCount }}</li>
      <li>{{ t('analysis.uniqueWords') }}: {{ stats.uniqueWordCount }}</li>
      <li>{{ t('analysis.known') }}: {{ stats.knownWordsCount }}</li>
      <li>{{ t('analysis.unknown') }}: {{ stats.unknownWordsCount }}</li>
      <li>{{ t('analysis.constructions') }}: {{ stats.constructionCount }}</li>
    </ul>

    <section class="sentences">
      <article v-for="sentence in analysis.sentences" :key="sentence.id" class="sentence">
        <span v-for="token in sentence.tokens" :key="token.id" :class="tokenClass(token)">
          {{ token.text }}
        </span>
      </article>
    </section>

    <section v-if="analysis.words.length" class="words-list">
      <h3 class="section-title">{{ t('analysis.wordList') }}</h3>
      <ul>
        <li v-for="word in analysis.words" :key="word.normalized">
          {{ word.text }} ×{{ word.occurrenceCount }}
          <span :class="word.known ? 'tag tag--known' : 'tag tag--unknown'">
            {{ word.known ? t('analysis.inDb') : t('analysis.newWord') }}
          </span>
        </li>
      </ul>
    </section>
  </PixelCard>
</template>

<style scoped>
.stats {
  margin: 0 0 1rem;
  padding-left: 1rem;
  font-size: var(--pixel-font-size-xs);
  color: var(--pixel-text-muted);
}

.sentences {
  margin-bottom: 1rem;
}

.sentence {
  margin-bottom: 0.65rem;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.7;
}

.token--known {
  color: var(--pixel-success);
}

.token--unknown {
  color: var(--pixel-warning);
}

.token--punct {
  color: var(--pixel-text-muted);
}

.section-title {
  margin: 0 0 0.35rem;
  font-size: var(--pixel-font-size-xs);
  font-weight: normal;
}

.words-list ul {
  margin: 0;
  padding-left: 1rem;
  font-size: var(--pixel-font-size-xs);
}

.tag {
  margin-left: 0.35rem;
  font-size: 0.5rem;
}

.tag--known {
  color: var(--pixel-success);
}

.tag--unknown {
  color: var(--pixel-warning);
}
</style>
