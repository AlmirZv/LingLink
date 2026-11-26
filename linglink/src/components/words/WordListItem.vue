<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import PixelProgressBar from '@/components/ui/PixelProgressBar.vue'
import type { UserWordGroup } from '@/domain/words/vocabularyFilters'

const props = defineProps<{
  group: UserWordGroup
  knowingIds?: ReadonlySet<string>
}>()

const emit = defineEmits<{
  select: [wordId: string]
  know: [wordIds: string[]]
}>()

const { t } = useI18n()

const known = computed(() => props.group.mastery >= props.group.masteryTarget)
const knowing = computed(() =>
  props.group.members.some((member) => props.knowingIds?.has(member.word.id)),
)
const masteryPercent = computed(() => (props.group.mastery / props.group.masteryTarget) * 100)
</script>

<template>
  <div class="word-row pixel-box">
    <div class="word-row__main">
      <button type="button" class="word-row__open" @click="emit('select', group.id)">
        {{ group.word.word }}
      </button>
      <button
        type="button"
        class="know"
        :disabled="known || knowing"
        :aria-busy="knowing"
        @click="emit('know', group.members.map((member) => member.word.id))"
      >
        {{ knowing ? t('common.loading') : t('words.known') }}
      </button>
    </div>
    <button type="button" class="word-row__open" @click="emit('select', group.id)">
      <PixelProgressBar
        :label="`${group.mastery}/${group.masteryTarget}`"
        :value="masteryPercent"
        :max="100"
      />
    </button>
  </div>
</template>

<style scoped>
.word-row {
  padding: 0.65rem 0.75rem;
}

.word-row__main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

.word-row__open {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--pixel-font-size-xs);
  text-align: left;
  cursor: pointer;
}

.word-row__main .word-row__open {
  width: auto;
  flex: 1 1 auto;
  min-width: 0;
}

.know {
  flex: 0 0 auto;
  font-size: 0.72rem;
  font-weight: 650;
  line-height: 1.2;
  padding: 0.4rem 0.65rem;
  cursor: pointer;
  color: var(--pixel-on-accent);
  background: var(--pixel-accent);
  border: none;
  border-radius: var(--pixel-radius-pill);
  box-shadow: none;
}

.know:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
