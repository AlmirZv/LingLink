<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import WordDetailPanel from '@/components/words/WordDetailPanel.vue'

const route = useRoute()
const wordId = computed(() => route.params.wordId as string)
</script>

<template>
  <div class="word-detail pixel-box">
    <WordDetailPanel :word-id="wordId" />
  </div>
</template>

<style scoped>
.word-detail {
  padding: 0.75rem;
}
</style>
