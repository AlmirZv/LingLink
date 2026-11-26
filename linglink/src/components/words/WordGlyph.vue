<script setup lang="ts">
import { computed } from 'vue'

import { normalizeWordStress } from '@/constants/languages'
import type { Word } from '@/types/db'

const props = defineProps<{
  word: Pick<Word, 'word' | 'furigana'>
}>()

const surface = computed(() => normalizeWordStress(props.word.word))
</script>

<template>
  <ruby v-if="word.furigana" class="word-glyph">
    {{ surface }}<rp>（</rp><rt>{{ word.furigana }}</rt><rp>）</rp>
  </ruby>
  <span v-else class="word-glyph">{{ surface }}</span>
</template>

<style scoped>
.word-glyph {
  font-family: 'Noto Sans', 'Segoe UI', sans-serif;
  font-size: inherit;
}

rt {
  font-size: 0.55em;
}
</style>
