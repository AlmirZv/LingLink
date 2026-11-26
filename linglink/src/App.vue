<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import ForceUpdateOverlay from '@/components/ForceUpdateOverlay.vue'
import { useForceUpdate } from '@/composables/useForceUpdate'
import { readClientError } from '@/reportClientError'
import { useSessionStore } from '@/stores/session'

const message = ref('')
const { locale } = useI18n()
const session = useSessionStore()
const { blocked, downloadUrl } = useForceUpdate()

onMounted(() => {
  message.value = readClientError()
  window.addEventListener('linglink-error', (event) => {
    message.value = (event as CustomEvent<string>).detail
  })
})
</script>

<template>
  <p v-if="message" class="client-error">{{ message }}</p>
  <RouterView :key="session.interfaceLanguage || locale" />
  <ForceUpdateOverlay :open="blocked" :download-url="downloadUrl" />
</template>

<style>
.client-error {
  position: fixed;
  z-index: 50;
  top: 0;
  left: 0;
  right: 0;
  margin: 0;
  padding: 0.75rem 1rem;
  background: #ff004d;
  color: #fff;
  font-size: 0.875rem;
  line-height: 1.4;
}
</style>
