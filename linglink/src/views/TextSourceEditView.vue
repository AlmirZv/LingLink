<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import ScanModeDialog from '@/components/texts/ScanModeDialog.vue'
import TextAuthorFields from '@/components/texts/TextAuthorFields.vue'
import TextScanReview from '@/components/texts/TextScanReview.vue'
import PixelButton from '@/components/ui/PixelButton.vue'
import PixelCard from '@/components/ui/PixelCard.vue'
import PixelProgressBar from '@/components/ui/PixelProgressBar.vue'
import SaveStatusOverlay from '@/components/ui/SaveStatusOverlay.vue'
import { useLanguageContext } from '@/composables/useLanguageContext'
import { libraryReturnLocation, rememberLibraryExpand } from '@/composables/useLibraryReturn'
import { useRepositories } from '@/composables/useRepositories'
import { useTextDetail } from '@/composables/useTextDetail'
import { clearRevealCount } from '@/composables/useReadingReveal'
import { seedFinalProposalsFromText } from '@/domain/text/finalTranslationProposals'
import { parseTopicNames } from '@/domain/text/parseTopicNames'
import {
  publishDraftFromScan,
  resolveTopicIds,
  topicNamesLine,
  updatePublishedCatalog,
} from '@/services/textAuthoringService'
import { scanChoices, scanText, type ScanMode, type TextScan } from '@/services/textScan'
import { useSessionStore } from '@/stores/session'
import type { FinalTranslationProposal, LanguageCode, LearningText, TextLevel } from '@/types/db'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const session = useSessionStore()
const repos = useRepositories()
const { translationTargetForText } = useLanguageContext()

const textId = computed(() => route.params.id as string)
const { text, loading, error } = useTextDetail(() => textId.value)
const fields = ref<{ flushSeries: () => Promise<string> } | null>(null)

const title = ref('')
const language = ref<LanguageCode>('ru')
const level = ref<TextLevel>('beginner')
const seriesId = ref('')
const topicsRaw = ref('')
const body = ref('')
const originalBody = ref('')
const originalLanguage = ref<LanguageCode>('ru')
const filled = ref(false)
const scanning = ref(false)
const saving = ref(false)
const savePhase = ref<'idle' | 'saving' | 'done'>('idle')
const saveError = ref('')
const modeOpen = ref(false)
const scan = ref<TextScan | null>(null)
const translationProgress = ref(0)
const savedProposals = ref<FinalTranslationProposal[]>([])
const review = ref<{
  finalProposals: () => FinalTranslationProposal[]
} | null>(null)

function joinedBody(value: LearningText): string {
  return [...value.sentences]
    .sort((a, b) => a.position - b.position)
    .map((sentence) => sentence.text)
    .join('\n')
}

watch(text, (value) => {
  if (!value) return
  if (session.user?.id && value.authorId !== session.user.id) {
    void router.replace({ name: 'text-preview', params: { id: value.id }, query: route.query })
    return
  }
  if (filled.value) return
  title.value = value.title
  language.value = value.language
  originalLanguage.value = value.language
  level.value = value.level
  seriesId.value = value.seriesId ?? ''
  body.value = joinedBody(value)
  originalBody.value = body.value
  filled.value = true
  void topicNamesLine(repos, value.topics).then((line) => {
    if (!topicsRaw.value) topicsRaw.value = line
  })
})

const bodyOrLanguageChanged = computed(
  () => body.value.trim() !== originalBody.value.trim() || language.value !== originalLanguage.value,
)

const canScan = computed(() => title.value.trim().length > 0 && body.value.trim().length > 0 && !scanning.value)
const canSaveMeta = computed(
  () => Boolean(text.value && title.value.trim() && !bodyOrLanguageChanged.value && !scanning.value && !saving.value),
)

function goBack() {
  if (window.history.state?.back) {
    router.back()
    return
  }
  void router.push({ name: 'text-preview', params: { id: textId.value }, query: route.query })
}

function clearScan() {
  scan.value = null
  translationProgress.value = 0
  saveError.value = ''
}

function openScanMode() {
  if (!canScan.value) return
  saveError.value = ''
  modeOpen.value = true
}

async function scanSource(mode: ScanMode) {
  const current = text.value
  const userId = session.user?.id
  if (!current || !userId || !canScan.value) return
  modeOpen.value = false
  scanning.value = true
  saveError.value = ''
  try {
    if (fields.value) seriesId.value = await fields.value.flushSeries()
    const targetLanguage = translationTargetForText(language.value)
    scan.value = await scanText(repos, {
      text: body.value.trim(),
      language: language.value,
      targetLanguage,
      authorId: userId,
      mode,
    })
    savedProposals.value = seedFinalProposalsFromText(current, targetLanguage)
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : t('analysis.saveFailed')
    scan.value = null
  } finally {
    scanning.value = false
  }
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function resolveTopics(userId: string) {
  return resolveTopicIds(repos, parseTopicNames(topicsRaw.value), language.value, userId)
}

async function finish(published: LearningText, bodyChanged: boolean) {
  if (bodyChanged) clearRevealCount(published.id)
  savePhase.value = 'done'
  await wait(400)
  rememberLibraryExpand(published.id)
  await router.replace(libraryReturnLocation())
}

async function saveMeta() {
  const current = text.value
  const userId = session.user?.id
  if (!current || !userId || !canSaveMeta.value) return
  saving.value = true
  savePhase.value = 'saving'
  saveError.value = ''
  try {
    if (fields.value) seriesId.value = await fields.value.flushSeries()
    const topics = await resolveTopics(userId)
    const published = await updatePublishedCatalog(repos, current, {
      title: title.value,
      level: level.value,
      topics,
      seriesId: seriesId.value,
    })
    text.value = published
    await finish(published, false)
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : t('analysis.saveFailed')
    savePhase.value = 'idle'
    saving.value = false
  }
}

async function save() {
  const current = text.value
  const userId = session.user?.id
  const scanned = scan.value
  if (!current || !userId || !scanned || saving.value) return
  saving.value = true
  savePhase.value = 'saving'
  saveError.value = ''
  try {
    if (fields.value) seriesId.value = await fields.value.flushSeries()
    const topics = await resolveTopics(userId)
    const bodyChanged = body.value.trim() !== originalBody.value.trim()
    const published = await publishDraftFromScan(repos, current, {
      analysis: scanned.analysis,
      authorId: userId,
      targetLanguage: scanned.targetLanguage,
      title: title.value,
      level: level.value,
      topics,
      seriesId: seriesId.value,
      choices: scanChoices(scanned),
      finalProposals: review.value?.finalProposals(),
    })
    await finish(published, bodyChanged)
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : t('analysis.saveFailed')
    savePhase.value = 'idle'
    saving.value = false
  }
}
</script>

<template>
  <div class="source-edit">
    <p v-if="loading && !text" class="pixel-text-muted">{{ t('common.loading') }}</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <PixelCard v-else-if="text && !scan">
      <TextAuthorFields
        ref="fields"
        v-model:title="title"
        v-model:language="language"
        v-model:level="level"
        v-model:series-id="seriesId"
        v-model:body="body"
        v-model:topics-raw="topicsRaw"
      />
      <p v-if="saveError" class="error">{{ saveError }}</p>
      <div class="actions">
        <PixelButton block :disabled="!canScan" @click="openScanMode">
          {{ t('analysis.analyze') }}
        </PixelButton>
        <PixelButton block :disabled="!canSaveMeta" @click="saveMeta">
          {{ t('common.save') }}
        </PixelButton>
        <PixelButton variant="secondary" block :disabled="scanning" @click="goBack">
          {{ t('common.cancel') }}
        </PixelButton>
      </div>
    </PixelCard>
    <template v-else-if="text && scan && session.user">
      <TextScanReview
        ref="review"
        :scan="scan"
        :repos="repos"
        :author-id="session.user.id"
        :saved-proposals="savedProposals"
        :persist-text-id="text.id"
        :show-title="false"
        @progress="translationProgress = $event"
      />
      <div class="actions">
        <PixelProgressBar :label="t('home.translationProgress')" :value="Math.round(translationProgress * 100)" />
        <PixelButton block :disabled="saving" @click="save">
          {{ saving ? t('common.loading') : t('common.save') }}
        </PixelButton>
        <PixelButton variant="secondary" block :disabled="saving" @click="clearScan">
          {{ t('common.cancel') }}
        </PixelButton>
        <p v-if="saveError" class="error">{{ saveError }}</p>
      </div>
    </template>
    <ScanModeDialog :open="modeOpen" @close="modeOpen = false" @pick="scanSource" />
    <SaveStatusOverlay
      :phase="scanning ? 'saving' : savePhase"
      :message="scanning ? t('analysis.translating') : undefined"
    />
  </div>
</template>

<style scoped>
.source-edit {
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

.error {
  color: var(--pixel-danger);
  font-size: var(--pixel-font-size-xs);
}
</style>
