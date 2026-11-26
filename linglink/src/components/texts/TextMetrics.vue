<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  views: number
  likes: number
  edits: number
  comments: number
}>()

const { t } = useI18n()
</script>

<template>
  <ul class="metrics">
    <li class="metric" :aria-label="t('texts.readers', { n: views })">
      <svg class="metric__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
        />
        <circle cx="8" cy="8" r="1.8" fill="currentColor" />
      </svg>
      <span>{{ views }}</span>
    </li>
    <li class="metric" :aria-label="t('texts.likes', { n: likes })">
      <svg class="metric__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M8 13.2S3.2 9.8 3.2 6.7C3.2 5.1 4.4 4 5.8 4c.9 0 1.6.4 2.2 1.2C8.6 4.4 9.3 4 10.2 4c1.4 0 2.6 1.1 2.6 2.7 0 3.1-4.8 6.5-4.8 6.5z"
          fill="currentColor"
        />
      </svg>
      <span>{{ likes }}</span>
    </li>
    <li class="metric" :aria-label="t('texts.edits', { n: edits })">
      <svg class="metric__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M11.2 1.8l3 3L5.8 13.2 2.2 14l.8-3.6L11.2 1.8z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linejoin="round"
        />
      </svg>
      <span>{{ edits }}</span>
    </li>
    <li class="metric" :aria-label="t('texts.commentStat', { n: comments })">
      <svg class="metric__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M3 3.2h10v7.2H7.2L4 13.2V10.4H3V3.2z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linejoin="round"
        />
      </svg>
      <span>{{ comments }}</span>
    </li>
  </ul>
</template>

<style scoped>
.metrics {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--pixel-text);
  font-size: 0.55rem;
  line-height: 1;
}

.metric {
  display: flex;
  align-items: center;
  gap: 0.15rem;
}

.metric__icon {
  width: 0.9rem;
  height: 0.9rem;
  display: block;
  flex: 0 0 auto;
}
</style>
