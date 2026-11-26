<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import icon from '@/assets/app-icon.png'

withDefaults(
  defineProps<{
    size?: string
  }>(),
  { size: '5.5rem' },
)

const { t } = useI18n()
</script>

<template>
  <img class="app-logo" :src="icon" :alt="t('app.name')" :style="{ width: size, height: size }" />
</template>

<style scoped>
.app-logo {
  display: block;
  object-fit: contain;
  border-radius: 22%;
}
</style>
