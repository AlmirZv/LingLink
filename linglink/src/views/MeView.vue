<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { languageLabel } from '@/constants/languages'
import { useLanguageContext } from '@/composables/useLanguageContext'
import { useRepositories } from '@/composables/useRepositories'
import {
  groupWordEntries,
  masteryBucket,
  type UserWordEntry,
} from '@/domain/words/vocabularyFilters'
import { useSessionStore } from '@/stores/session'
import AppLogo from '@/components/ui/AppLogo.vue'
import PixelCard from '@/components/ui/PixelCard.vue'
import PixelDialog from '@/components/ui/PixelDialog.vue'
import ThemeSwitch from '@/components/ui/ThemeSwitch.vue'
import SettingsView from '@/views/SettingsView.vue'

const { t } = useI18n()
const router = useRouter()
const session = useSessionStore()
const repos = useRepositories()
const { learningLanguage, translationTargetForText } = useLanguageContext()

const stats = ref({ wordsKnown: 0, textsCompleted: 0 })
const settingsOpen = ref(false)
const aboutOpen = ref(false)

async function loadProfile() {
  const uid = session.user?.id
  if (!uid) {
    stats.value = { wordsKnown: 0, textsCompleted: 0 }
    return
  }

  const [allWords, wordRows, textRows, history, published] = await Promise.all([
    repos.words.listAll(),
    repos.progress.listWordProgress(uid),
    repos.progress.listTextProgress(uid),
    repos.wordTextHistory.listForUser(uid),
    repos.texts.listPublished().catch(() => []),
  ])

  const progressByWord = new Map(wordRows.map((row) => [row.wordId, row]))
  const textsByWord = new Map<string, Set<string>>()
  for (const row of history) {
    const texts = textsByWord.get(row.wordId) ?? new Set<string>()
    texts.add(row.textId)
    textsByWord.set(row.wordId, texts)
  }

  const wordsById = new Map(allWords.map((word) => [word.id, word]))
  const language = learningLanguage.value
  const entries: UserWordEntry[] = allWords
    .filter((word) => word.language === language)
    .map((word) => ({
      word,
      level: progressByWord.get(word.id)?.level ?? 0,
      textsMastered: textsByWord.get(word.id)?.size ?? 0,
    }))
  const groups = groupWordEntries(entries, translationTargetForText(language), wordsById)
  const publishedIds = new Set(published.map((text) => text.id))

  stats.value = {
    wordsKnown: groups.filter((group) => masteryBucket(group.mastery, group.masteryTarget) === 'known')
      .length,
    textsCompleted: textRows.filter((row) => row.progress >= 1 && publishedIds.has(row.textId)).length,
  }
}

onMounted(() => {
  void loadProfile()
})

watch(
  () => [session.user?.id, learningLanguage.value] as const,
  () => {
    void loadProfile()
  },
)

const learningLabel = computed(() =>
  session.activeLearningLanguage ? languageLabel(session.activeLearningLanguage) : '—',
)

const menuItems = computed(() => [
  { id: 'settings', label: t('me.settings') },
  { id: 'my-texts', label: t('me.myTexts'), route: { name: 'my-texts' as const } },
  {
    id: 'saved',
    label: t('me.savedTexts'),
    route: { name: 'me-stub' as const, params: { section: 'saved' } },
  },
  {
    id: 'contributions',
    label: t('me.contributions'),
    route: { name: 'me-stub' as const, params: { section: 'contributions' } },
  },
  { id: 'about', label: t('me.about') },
])

function openMenuItem(item: (typeof menuItems.value)[number]) {
  if (item.id === 'settings') {
    settingsOpen.value = true
    return
  }
  if (item.id === 'about') {
    aboutOpen.value = true
    return
  }
  if (item.route) void router.push(item.route)
}
</script>

<template>
  <div class="me">
    <PixelCard :title="session.user?.displayName ?? t('nav.me')">
      <p class="stat-line pixel-text-muted">
        {{ t('onboarding.learningLanguage') }}: {{ learningLabel }}
      </p>
      <ul class="stats">
        <li>{{ t('me.statsWords', { n: stats.wordsKnown }) }}</li>
        <li>{{ t('me.statsTexts', { n: stats.textsCompleted }) }}</li>
      </ul>
    </PixelCard>

    <nav class="menu pixel-box">
      <button
        v-for="item in menuItems"
        :key="item.id"
        type="button"
        class="menu-item"
        @click="openMenuItem(item)"
      >
        {{ item.label }}
      </button>
    </nav>

    <PixelDialog
      :open="settingsOpen"
      placement="center"
      hide-close
      :title="t('me.settings')"
      @close="settingsOpen = false"
    >
      <template #header-end>
        <ThemeSwitch />
      </template>
      <SettingsView />
    </PixelDialog>

    <PixelDialog
      :open="aboutOpen"
      placement="center"
      :title="t('me.about')"
      @close="aboutOpen = false"
    >
      <AppLogo class="about-logo" size="4.5rem" />
      <div class="about-copy">
        <p class="about-headline">{{ t('me.aboutHeadline') }}</p>
        <p class="about-body">{{ t('me.aboutBody') }}</p>
        <p class="about-body">{{ t('me.aboutBody2') }}</p>
        <p class="about-tagline">{{ t('me.aboutTagline') }}</p>
      </div>
    </PixelDialog>
  </div>
</template>

<style scoped>
.me {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.stat-line {
  margin: 0 0 0.5rem;
  font-size: var(--pixel-font-size-xs);
}

.stats {
  margin: 0;
  padding-left: 1rem;
  font-size: var(--pixel-font-size-xs);
}

.menu {
  display: flex;
  flex-direction: column;
}

.menu-item {
  font-family: inherit;
  font-size: var(--pixel-font-size-xs);
  text-align: left;
  padding: 0.75rem 1rem;
  border: none;
  border-bottom: 1px solid var(--pixel-border);
  background: transparent;
  color: var(--pixel-text);
  cursor: pointer;
}

.menu-item:last-child {
  border-bottom: none;
}

.about-logo {
  margin: 0 auto 0.85rem;
}

.about-copy {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.about-headline,
.about-tagline {
  margin: 0;
  font-size: var(--pixel-font-size-xs);
  font-weight: 700;
  line-height: 1.45;
  color: var(--pixel-text);
}

.about-body {
  margin: 0;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.55;
  color: var(--pixel-text);
}
</style>
