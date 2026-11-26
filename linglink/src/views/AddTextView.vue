<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import ScanModeDialog from '@/components/texts/ScanModeDialog.vue'
import TextAuthorFields from '@/components/texts/TextAuthorFields.vue'
import TextScanReview from '@/components/texts/TextScanReview.vue'
import SaveStatusOverlay from '@/components/ui/SaveStatusOverlay.vue'
import { useTextAnalysis } from '@/composables/useTextAnalysis'
import { useRepositories } from '@/composables/useRepositories'
import { useLanguageContext } from '@/composables/useLanguageContext'
import { useSessionStore } from '@/stores/session'
import { parseTopicNames } from '@/domain/text/parseTopicNames'
import { scanChoices, scanText, type ScanMode, type TextScan } from '@/services/textScan'
import { publishScannedText, resolveTopicIds } from '@/services/textAuthoringService'
import type { FinalTranslationProposal, LanguageCode, TextLevel } from '@/types/db'
import PixelButton from '@/components/ui/PixelButton.vue'
import PixelProgressBar from '@/components/ui/PixelProgressBar.vue'
import PixelCard from '@/components/ui/PixelCard.vue'

const { t } = useI18n()
const router = useRouter()
const repos = useRepositories()
const session = useSessionStore()
const { translationTargetForText } = useLanguageContext()
const { loading, error, clear } = useTextAnalysis()
const scan = ref<TextScan | null>(null)
const fields = ref<{ flushSeries: () => Promise<string> } | null>(null)

const title = ref('')
const language = ref<LanguageCode>('ru')
const level = ref<TextLevel>('beginner')
const seriesId = ref('')
const topicsRaw = ref('')
const body = ref('')
const publishing = ref(false)
const translationProgress = ref(0)
const review = ref<{ finalProposals: () => FinalTranslationProposal[] } | null>(null)
const formError = ref<string | null>(null)
const modeOpen = ref(false)

const canAnalyze = () => body.value.trim().length > 0 && title.value.trim().length > 0

function openScanMode() {
  formError.value = null
  error.value = null
  if (!canAnalyze()) {
    formError.value = t('analysis.validationRequired')
    return
  }
  modeOpen.value = true
}

async function analyze(mode: ScanMode) {
  modeOpen.value = false
  formError.value = null
  error.value = null
  loading.value = true
  try {
    if (fields.value) seriesId.value = await fields.value.flushSeries()
    scan.value = await scanText(repos, {
      text: body.value,
      language: language.value,
      targetLanguage: translationTargetForText(language.value),
      authorId: session.user?.id,
      mode,
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Scan failed'
    scan.value = null
  } finally {
    loading.value = false
  }
}

function resetPreview() {
  scan.value = null
  translationProgress.value = 0
  clear()
}

async function publish() {
  if (!scan.value || !session.user?.id) return
  formError.value = null
  if (!title.value.trim()) {
    formError.value = t('analysis.validationRequired')
    return
  }
  publishing.value = true
  try {
    if (fields.value) seriesId.value = await fields.value.flushSeries()
    const topics = await resolveTopicIds(
      repos,
      parseTopicNames(topicsRaw.value),
      language.value,
      session.user.id,
    )
    const published = await publishScannedText(repos, {
      analysis: scan.value.analysis,
      title: title.value,
      level: level.value,
      topics,
      authorId: session.user.id,
      seriesId: seriesId.value || undefined,
      targetLanguage: translationTargetForText(language.value),
      choices: scanChoices(scan.value),
      finalProposals: review.value?.finalProposals(),
    })
    resetPreview()
    void router.push({ name: 'text-preview', params: { id: published.id } })
  } catch (e) {
    formError.value = e instanceof Error ? e.message : 'Publish failed'
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <div class="add-text">
    <PixelCard v-if="!scan">
      <TextAuthorFields
        ref="fields"
        v-model:title="title"
        v-model:language="language"
        v-model:level="level"
        v-model:series-id="seriesId"
        v-model:body="body"
        v-model:topics-raw="topicsRaw"
      />

      <div class="actions">
        <PixelButton :disabled="loading || !canAnalyze()" block @click="openScanMode">
          {{ t('analysis.analyze') }}
        </PixelButton>
        <PixelButton variant="secondary" block @click="router.back()">{{ t('common.cancel') }}</PixelButton>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="formError" class="error">{{ formError }}</p>
    </PixelCard>

    <ScanModeDialog :open="modeOpen" @close="modeOpen = false" @pick="analyze" />
    <SaveStatusOverlay :phase="loading ? 'saving' : 'idle'" :message="t('analysis.translating')" />

    <TextScanReview
      v-if="scan && session.user"
      ref="review"
      :scan="scan"
      :repos="repos"
      :author-id="session.user.id"
      @progress="translationProgress = $event"
    />

    <div v-if="scan" class="publish-actions">
      <PixelProgressBar :label="t('home.translationProgress')" :value="Math.round(translationProgress * 100)" />
      <PixelButton block :disabled="publishing" @click="publish">{{ t('analysis.publish') }}</PixelButton>
      <PixelButton variant="secondary" block @click="resetPreview">{{ t('common.cancel') }}</PixelButton>
      <p v-if="formError" class="error">{{ formError }}</p>
    </div>
  </div>
</template>

<style scoped>
.add-text {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.publish-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.error {
  margin: 0.5rem 0 0;
  color: var(--pixel-danger);
  font-size: var(--pixel-font-size-xs);
}
</style>
