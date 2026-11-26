<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import TextScanReview from '@/components/texts/TextScanReview.vue'
import PixelButton from '@/components/ui/PixelButton.vue'
import PixelProgressBar from '@/components/ui/PixelProgressBar.vue'
import SaveStatusOverlay from '@/components/ui/SaveStatusOverlay.vue'
import { useLanguageContext } from '@/composables/useLanguageContext'
import { libraryReturnLocation, rememberLibraryExpand } from '@/composables/useLibraryReturn'
import { useRepositories } from '@/composables/useRepositories'
import { textEditCount } from '@/domain/text/communityEdits'
import { seedFinalProposalsFromText } from '@/domain/text/finalTranslationProposals'
import { publishDraftFromScan } from '@/services/textAuthoringService'
import { scanChoices, scanFromLearningText, type TextScan } from '@/services/textScan'
import { useSessionStore } from '@/stores/session'
import type { FinalTranslationProposal, LearningText } from '@/types/db'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const repos = useRepositories()
const session = useSessionStore()
const { translationTargetForText } = useLanguageContext()

const loading = ref(true)
const publishing = ref(false)
const savePhase = ref<'idle' | 'saving' | 'done'>('idle')
const error = ref<string | null>(null)
const draft = ref<LearningText | null>(null)
const scan = ref<TextScan | null>(null)
const savedProposals = ref<FinalTranslationProposal[]>([])
const translationProgress = ref(0)
const review = ref<{ finalProposals: () => FinalTranslationProposal[] } | null>(null)
const supplement = computed(() => route.name === 'text-supplement')

onMounted(async () => {
  const id = route.params.id as string
  const text = await repos.texts.getById(id)
  const uid = session.user?.id
  const canEdit =
    text &&
    uid &&
    (route.name === 'text-supplement'
      ? text.status === 'published' || text.status === 'hidden'
      : text.authorId === uid &&
        (text.status === 'draft' || text.status === 'published' || text.status === 'hidden'))
  if (!canEdit) {
    loading.value = false
    void router.replace(text ? { name: 'text-preview', params: { id: text.id } } : { name: 'my-texts' })
    return
  }
  const targetLanguage = translationTargetForText(text.language)
  savedProposals.value = seedFinalProposalsFromText(text, targetLanguage)
  scan.value = await scanFromLearningText(repos, text, targetLanguage)
  draft.value = text
  loading.value = false
})

function leaveSupplement() {
  void router.replace(libraryReturnLocation())
}

function cancel() {
  if (route.name === 'text-supplement') {
    leaveSupplement()
    return
  }
  if (draft.value?.status === 'published' || draft.value?.status === 'hidden') {
    void router.push({ name: 'text-preview', params: { id: draft.value.id }, query: { from: 'me' } })
    return
  }
  void router.push({ name: 'my-texts' })
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function goToLibrary(textId: string) {
  rememberLibraryExpand(textId)
  await router.replace(libraryReturnLocation())
}

async function publish() {
  if (!scan.value || !draft.value || !session.user?.id || publishing.value) return
  publishing.value = true
  savePhase.value = 'saving'
  error.value = null
  try {
    let published = await publishDraftFromScan(repos, draft.value, {
      analysis: scan.value.analysis,
      authorId: session.user.id,
      targetLanguage: scan.value.targetLanguage,
      choices: scanChoices(scan.value),
      finalProposals: review.value?.finalProposals(),
    })
    if (route.name === 'text-supplement' && published.authorId !== session.user.id) {
      published = await repos.texts.update({
        ...published,
        editCount: textEditCount(published) + 1,
      })
    }
    savePhase.value = 'done'
    await wait(400)
    await goToLibrary(published.id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('analysis.saveFailed')
    savePhase.value = 'idle'
    publishing.value = false
  }
}
</script>

<template>
  <div class="draft-review">
    <p v-if="loading" class="pixel-text-muted">{{ t('common.loading') }}</p>
    <template v-else-if="scan && session.user">
      <TextScanReview
        ref="review"
        :scan="scan"
        :repos="repos"
        :author-id="session.user.id"
        :saved-proposals="savedProposals"
        :persist-text-id="draft?.id"
        :show-title="false"
        :lock-filled-readings="supplement"
        @progress="translationProgress = $event"
      />
      <div class="publish-actions">
        <PixelProgressBar :label="t('home.translationProgress')" :value="Math.round(translationProgress * 100)" />
        <PixelButton block :disabled="publishing" @click="publish">
          {{ supplement ? t('common.save') : t('analysis.publish') }}
        </PixelButton>
        <PixelButton variant="secondary" block :disabled="publishing" @click="cancel">{{ t('common.cancel') }}</PixelButton>
        <p v-if="error" class="error">{{ error }}</p>
      </div>
    </template>
    <SaveStatusOverlay :phase="savePhase" />
  </div>
</template>

<style scoped>
.draft-review {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
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
