<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import TextCard from '@/components/texts/TextCard.vue'
import PixelButton from '@/components/ui/PixelButton.vue'
import PixelCard from '@/components/ui/PixelCard.vue'
import { useRestoreLibraryReturn } from '@/composables/useLibraryReturn'
import { useRepositories } from '@/composables/useRepositories'
import { loadContributionStats, type ContributionStats } from '@/services/contributionStats'
import { useSessionStore } from '@/stores/session'
import type { LearningText, UserNotification } from '@/types/db'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const session = useSessionStore()
const repos = useRepositories()

const section = computed(() => String(route.params.section ?? ''))
const title = computed(() => t(`me.sections.${section.value}`, section.value))
const saved = ref<LearningText[]>([])
const loadingSaved = ref(section.value === 'saved')

useRestoreLibraryReturn(() => section.value !== 'saved' || !loadingSaved.value)
const notices = ref<UserNotification[]>([])
const loadingNotices = ref(false)
const contributions = ref<ContributionStats | null>(null)
const loadingContributions = ref(false)

const contributionLines = computed(() => {
  const stats = contributions.value
  if (!stats) return []
  return [
    t('me.contributionTexts', { n: stats.textCount }),
    t('me.contributionTextLikes', { n: stats.textLikes }),
    t('me.contributionTextDislikes', { n: stats.textDislikes }),
    t('me.contributionTranslations', { n: stats.translationCount }),
    t('me.contributionTranslationLikes', { n: stats.translationLikes }),
    t('me.contributionTranslationDislikes', { n: stats.translationDislikes }),
    t('me.contributionRemoved', { n: stats.removedTranslations }),
  ]
})

watch(
  () => (section.value === 'saved' ? session.user?.id ?? '' : ''),
  (userId) => {
    if (!userId) {
      saved.value = []
      return
    }
    loadingSaved.value = true
    void repos.texts
      .listSaved(userId)
      .then((rows) => {
        saved.value = rows
      })
      .finally(() => {
        loadingSaved.value = false
      })
  },
  { immediate: true },
)

watch(
  () => (section.value === 'notifications' ? session.user?.id ?? '' : ''),
  (userId) => {
    if (!userId) {
      notices.value = []
      return
    }
    loadingNotices.value = true
    void repos.notifications
      .list(userId)
      .then(async (rows) => {
        notices.value = rows
        await Promise.all(
          rows
            .filter((notice) => !notice.read)
            .map((notice) => repos.notifications.markRead(userId, notice.id).catch(() => undefined)),
        )
      })
      .finally(() => {
        loadingNotices.value = false
      })
  },
  { immediate: true },
)

watch(
  () => (section.value === 'contributions' ? session.user?.id ?? '' : ''),
  (userId) => {
    if (!userId) {
      contributions.value = null
      return
    }
    loadingContributions.value = true
    void loadContributionStats(repos, userId)
      .then((stats) => {
        contributions.value = stats
      })
      .finally(() => {
        loadingContributions.value = false
      })
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="section === 'saved'" class="stack">
    <p v-if="loadingSaved" class="pixel-text-muted">{{ t('common.loading') }}</p>
    <p v-else-if="!saved.length" class="pixel-text-muted">{{ t('texts.noSaved') }}</p>
    <TextCard v-for="item in saved" :key="item.id" :text="item" />
    <PixelButton variant="secondary" block @click="router.push({ name: 'me' })">
      {{ t('me.backToProfile') }}
    </PixelButton>
  </div>
  <div v-else-if="section === 'notifications'" class="stack">
    <p v-if="loadingNotices" class="pixel-text-muted">{{ t('common.loading') }}</p>
    <p v-else-if="!notices.length" class="pixel-text-muted">{{ t('me.noNotifications') }}</p>
    <ul v-else class="notices pixel-box">
      <li v-for="notice in notices" :key="notice.id" class="notice">
        {{ t('me.notificationRemoved', { word: notice.word, translation: notice.translation }) }}
      </li>
    </ul>
    <PixelButton variant="secondary" block @click="router.push({ name: 'me' })">
      {{ t('me.backToProfile') }}
    </PixelButton>
  </div>
  <PixelCard v-else-if="section === 'contributions'" :title="title">
    <p v-if="loadingContributions" class="pixel-text-muted">{{ t('common.loading') }}</p>
    <ul v-else class="stats">
      <li v-for="line in contributionLines" :key="line">{{ line }}</li>
    </ul>
    <PixelButton variant="secondary" block @click="router.push({ name: 'me' })">
      {{ t('me.backToProfile') }}
    </PixelButton>
  </PixelCard>
  <PixelCard v-else :title="title">
    <p class="pixel-text-muted">{{ t('me.sectionSoon') }}</p>
    <PixelButton variant="secondary" block @click="router.push({ name: 'me' })">
      {{ t('me.backToProfile') }}
    </PixelButton>
  </PixelCard>
</template>

<style scoped>
.stack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

p {
  margin: 0 0 1rem;
  font-size: var(--pixel-font-size-xs);
}

.stack p,
.stats {
  margin: 0;
}

.stats {
  padding-left: 1rem;
  font-size: var(--pixel-font-size-xs);
}

.notices {
  margin: 0;
  padding: 0;
  list-style: none;
}

.notice {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--pixel-border);
  font-size: var(--pixel-font-size-xs);
  line-height: 1.5;
}

.notice:last-child {
  border-bottom: none;
}
</style>
