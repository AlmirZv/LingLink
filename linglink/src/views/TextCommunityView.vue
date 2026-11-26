<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import FinalTranslationDialog from '@/components/texts/FinalTranslationDialog.vue'
import PixelButton from '@/components/ui/PixelButton.vue'
import PixelCard from '@/components/ui/PixelCard.vue'
import PixelDialog from '@/components/ui/PixelDialog.vue'
import PixelInput from '@/components/ui/PixelInput.vue'
import PixelProgressBar from '@/components/ui/PixelProgressBar.vue'
import PixelSelect from '@/components/ui/PixelSelect.vue'
import { CONTENT_LANGUAGE_OPTIONS } from '@/constants/languages'
import { useLanguageContext } from '@/composables/useLanguageContext'
import { useRepositories } from '@/composables/useRepositories'
import { useTextDetail } from '@/composables/useTextDetail'
import { computeTranslationProgress } from '@/services/textDenormalize'
import {
  proposalsForSentence,
  replaceSentenceProposals,
  seedFinalProposalsFromText,
  winningFinalProposal,
} from '@/domain/text/finalTranslationProposals'
import { collectUniqueWordGroups } from '@/domain/translation/wordGroups'
import {
  collectGroupProposals,
  persistFinalProposals,
  selectWordProposal,
  suggestWordTranslation,
  submitReport,
  voteOnProposal,
  wordsNeedingTranslation,
} from '@/services/communityService'
import { useSessionStore } from '@/stores/session'
import type { FinalTranslationProposal, ID, LanguageCode, WordTranslationProposal } from '@/types/db'

const route = useRoute()
const { t } = useI18n()
const repos = useRepositories()
const session = useSessionStore()
const { knownLanguage, translationTargetForText } = useLanguageContext()

const textId = computed(() => route.params.id as string)
const { text, loading, error, reload } = useTextDetail(() => textId.value)

const tab = ref<'words' | 'natural'>('words')
const modalGroupKey = ref<string | null>(null)
const correctionText = ref('')
const correctionReason = ref('')
const finalOpen = ref(false)
const finalSentenceId = ref<string | null>(null)
const savingNatural = ref(false)
const reportOpen = ref(false)
const reportReason = ref('')
const proposalLabels = ref<Record<ID, string>>({})
const proposalLanguages = ref<Record<ID, string>>({})
const userVotes = ref<Record<ID, 1 | -1>>({})

const translationLanguage = ref<LanguageCode>(knownLanguage.value)
const targetLanguage = computed(() => translationLanguage.value)
const translationLanguageOptions = computed(() =>
  CONTENT_LANGUAGE_OPTIONS.filter((language) => language.code !== text.value?.language).map((language) => ({
    value: language.code,
    label: `${language.flag} ${language.nativeName}`,
  })),
)

watch(
  () => text.value?.id,
  () => {
    const value = text.value
    if (!value) return
    const next = translationTargetForText(value.language)
    translationLanguage.value = next === value.language ? knownLanguage.value : next
  },
  { immediate: true },
)
const progressPercent = computed(() =>
  text.value ? Math.round(computeTranslationProgress(text.value) * 100) : 0,
)
const needing = computed(() => (text.value ? wordsNeedingTranslation(text.value) : []))
/** Natural / bridge: for ja originals stored under L_known (ru); for ru originals under L_learn. */
const finalTranslation = computed(() => {
  if (!text.value) return null
  return (
    text.value.finalTranslations[targetLanguage.value] ??
    text.value.finalTranslations[knownLanguage.value] ??
    null
  )
})

const modalGroup = computed(() => {
  if (!text.value || !modalGroupKey.value) return null
  return collectUniqueWordGroups(text.value).find((g) => g.key === modalGroupKey.value) ?? null
})

const modalProposals = computed((): WordTranslationProposal[] => {
  if (!text.value || !modalGroupKey.value) return []
  return collectGroupProposals(text.value, modalGroupKey.value).filter((proposal) => {
    const language = proposalLanguages.value[proposal.id]
    return !language || language === translationLanguage.value
  })
})

async function loadProposalLabels(proposals: WordTranslationProposal[]) {
  const next: Record<ID, string> = { ...proposalLabels.value }
  for (const p of proposals) {
    if (next[p.id]) continue
    const word = await repos.words.getById(p.translationWordId)
    next[p.id] = word?.word ?? p.translationWordId
    proposalLanguages.value = { ...proposalLanguages.value, [p.id]: word?.language ?? '' }
  }
  proposalLabels.value = next
}

watch(modalProposals, (list) => {
  void loadProposalLabels(list)
})

const finalProposals = computed(() =>
  text.value ? seedFinalProposalsFromText(text.value, targetLanguage.value) : [],
)

const openFinalProposals = computed(() =>
  finalSentenceId.value ? proposalsForSentence(finalProposals.value, finalSentenceId.value) : [],
)

const orderedSentences = computed(() =>
  [...(text.value?.sentences ?? [])].sort((a, b) => a.position - b.position),
)

function sentenceFinal(sentenceId: string) {
  return winningFinalProposal(proposalsForSentence(finalProposals.value, sentenceId))?.text ?? ''
}

function openFinal(sentenceId: string) {
  finalSentenceId.value = sentenceId
  finalOpen.value = true
}

function closeFinal() {
  finalOpen.value = false
  finalSentenceId.value = null
}

const openFinalSource = computed(
  () => orderedSentences.value.find((sentence) => sentence.id === finalSentenceId.value)?.text ?? '',
)

function openGroup(key: string) {
  modalGroupKey.value = key
  correctionText.value = ''
  correctionReason.value = ''
}

function closeModal() {
  modalGroupKey.value = null
}

async function refreshVotes(proposals: WordTranslationProposal[]) {
  const uid = session.user?.id
  if (!uid) return
  const next: Record<ID, 1 | -1> = { ...userVotes.value }
  for (const p of proposals) {
    const vote = await repos.translationVotes.getUserVote(uid, p.id)
    if (vote) next[p.id] = vote.value
    else delete next[p.id]
  }
  userVotes.value = next
}

watch(modalProposals, (list) => {
  void refreshVotes(list)
})

async function onSelectProposal(proposalId: ID) {
  if (!text.value || !modalGroupKey.value) return
  await selectWordProposal(repos, text.value.id, modalGroupKey.value, proposalId)
  await reload()
}

async function onVote(proposalId: ID, value: 1 | -1) {
  if (!text.value || !session.user?.id) return
  await voteOnProposal(repos, text.value.id, proposalId, session.user.id, value)
  await reload()
  await refreshVotes(modalProposals.value)
}

async function onSuggestCorrection() {
  if (!text.value || !modalGroupKey.value || !session.user?.id) return
  const surface = correctionText.value.trim()
  if (!surface) return
  await suggestWordTranslation(
    repos,
    text.value.id,
    modalGroupKey.value,
    surface,
    targetLanguage.value,
    session.user.id,
    correctionReason.value.trim() || undefined,
  )
  correctionText.value = ''
  correctionReason.value = ''
  await reload()
}

async function onFinalChange(next: FinalTranslationProposal[], reason: 'save' | 'like' | 'delete') {
  if (!text.value || !session.user?.id || !finalSentenceId.value) return
  if (reason === 'save') savingNatural.value = true
  try {
    await persistFinalProposals(
      repos,
      text.value.id,
      targetLanguage.value,
      replaceSentenceProposals(finalProposals.value, finalSentenceId.value, next),
    )
    await reload()
  } finally {
    savingNatural.value = false
  }
}

async function onReport() {
  if (!text.value || !session.user?.id) return
  const reason = reportReason.value.trim()
  if (!reason) return
  await submitReport(repos, {
    targetType: 'text',
    targetId: text.value.id,
    userId: session.user.id,
    reason,
  })
  reportReason.value = ''
  reportOpen.value = false
}

</script>

<template>
  <div class="community">
    <p v-if="loading" class="pixel-text-muted">{{ t('common.loading') }}</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <template v-else-if="text">
      <PixelCard :title="t('community.title')" :subtitle="text.title">
        <PixelProgressBar :label="t('home.translationProgress')" :value="progressPercent" />
        <PixelSelect
          class="lang-select"
          v-model="translationLanguage"
          :label="t('community.translationLanguage')"
          :options="translationLanguageOptions"
        />
        <div class="tabs">
          <PixelButton
            :variant="tab === 'words' ? 'primary' : 'secondary'"
            @click="tab = 'words'"
          >
            {{ t('community.tabWords') }}
          </PixelButton>
          <PixelButton
            :variant="tab === 'natural' ? 'primary' : 'secondary'"
            @click="tab = 'natural'"
          >
            {{ t('community.tabNatural') }}
          </PixelButton>
        </div>
        <PixelButton class="report-btn" variant="secondary" block @click="reportOpen = true">
          {{ t('community.report') }}
        </PixelButton>
      </PixelCard>

      <template v-if="tab === 'words'">
        <PixelCard :title="t('community.needsTranslation')" :subtitle="String(needing.length)">
          <p v-if="!needing.length" class="pixel-text-muted">{{ t('community.allTranslated') }}</p>
          <ul v-else class="need-list">
            <li v-for="group in needing" :key="group.key">
              <button type="button" class="word-link" @click="openGroup(group.key)">
                {{ group.surface }}
                <span class="pixel-text-muted">×{{ group.occurrenceCount }}</span>
              </button>
            </li>
          </ul>
        </PixelCard>

        <PixelCard :title="t('community.allWords')">
          <ul class="need-list">
            <li v-for="group in collectUniqueWordGroups(text)" :key="group.key">
              <button type="button" class="word-link" @click="openGroup(group.key)">
                {{ group.surface }}
              </button>
            </li>
          </ul>
        </PixelCard>
      </template>

      <template v-else>
        <PixelCard v-for="sentence in orderedSentences" :key="sentence.id">
          <p class="natural-line">{{ sentence.text }}</p>
          <p v-if="sentenceFinal(sentence.id)" class="final-preview">{{ sentenceFinal(sentence.id) }}</p>
          <PixelButton class="save-natural" variant="secondary" block @click="openFinal(sentence.id)">
            {{ t('analysis.finalTranslation') }}
          </PixelButton>
        </PixelCard>
        <FinalTranslationDialog
          v-if="session.user"
          :open="finalOpen"
          :proposals="openFinalProposals"
          :user-id="session.user.id"
          :source-text="openFinalSource"
          :saving="savingNatural"
          @close="closeFinal"
          @change="onFinalChange"
        />
      </template>

      <PixelDialog
        :open="modalGroupKey !== null"
        :title="modalGroup?.surface ?? t('community.proposals')"
        @close="closeModal"
      >
        <p v-if="modalProposals.length === 0" class="pixel-text-muted">{{ t('community.noProposals') }}</p>
        <ul v-else class="proposal-list">
          <li v-for="p in modalProposals" :key="p.id" class="proposal-row">
            <span>{{ proposalLabels[p.id] ?? '…' }}</span>
            <span class="votes pixel-text-muted">↑{{ p.votes.up }} ↓{{ p.votes.down }}</span>
            <div class="row-actions">
              <PixelButton variant="secondary" @click="onSelectProposal(p.id)">
                {{ t('community.select') }}
              </PixelButton>
              <PixelButton
                :variant="userVotes[p.id] === 1 ? 'primary' : 'secondary'"
                @click="onVote(p.id, 1)"
              >
                👍
              </PixelButton>
              <PixelButton
                :variant="userVotes[p.id] === -1 ? 'primary' : 'secondary'"
                @click="onVote(p.id, -1)"
              >
                👎
              </PixelButton>
            </div>
          </li>
        </ul>
        <div class="correction">
          <p class="pixel-text-muted">{{ t('community.suggestCorrection') }}</p>
          <PixelInput v-model="correctionText" :label="t('translation.enterTranslation')" />
          <PixelInput v-model="correctionReason" :label="t('community.reasonOptional')" />
          <PixelButton block :disabled="!correctionText.trim()" @click="onSuggestCorrection">
            {{ t('community.addProposal') }}
          </PixelButton>
        </div>
      </PixelDialog>

      <PixelDialog :open="reportOpen" :title="t('community.reportTitle')" @close="reportOpen = false">
        <PixelInput v-model="reportReason" :label="t('community.reportReason')" />
        <PixelButton block :disabled="!reportReason.trim()" @click="onReport">
          {{ t('community.reportSubmit') }}
        </PixelButton>
      </PixelDialog>
    </template>
  </div>
</template>

<style scoped>
.lang-select {
  margin-top: 0.75rem;
}

.tabs {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.report-btn {
  margin-top: 0.75rem;
}

.need-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.word-link {
  display: flex;
  justify-content: space-between;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  font: inherit;
  font-size: var(--pixel-font-size-xs);
  padding: 0.35rem 0;
  cursor: pointer;
  color: var(--pixel-accent);
}

.proposal-list {
  list-style: none;
  margin: 0 0 1rem;
  padding: 0;
}

.proposal-row {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--pixel-border);
  font-size: var(--pixel-font-size-xs);
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.correction {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.natural-line {
  font-size: var(--pixel-font-size-xs);
  line-height: 1.6;
}

.final-preview {
  margin: 0.5rem 0 0;
  white-space: pre-wrap;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.45;
}

.natural-line span {
  margin-right: 0.35rem;
}

.natural-line span.extra {
  background: var(--pixel-accent-soft, rgb(255 200 80 / 25%));
  padding: 0 0.15rem;
}

.legend {
  margin: 0.5rem 0 0;
  font-size: var(--pixel-font-size-xs);
}

.save-natural {
  margin-top: 0.5rem;
}

.error {
  color: var(--pixel-danger);
  font-size: var(--pixel-font-size-xs);
}
</style>
