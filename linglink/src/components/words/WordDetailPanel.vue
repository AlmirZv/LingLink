<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { useRepositories } from '@/composables/useRepositories'
import { useWordDetail } from '@/composables/useWordDetail'
import { activeEditBan } from '@/services/wordEditService'
import { useSessionStore } from '@/stores/session'
import WordGlyph from '@/components/words/WordGlyph.vue'
import PixelButton from '@/components/ui/PixelButton.vue'
import PixelProgressBar from '@/components/ui/PixelProgressBar.vue'

const props = defineProps<{
  wordId: string
  embedded?: boolean
}>()

const emit = defineEmits<{
  edit: []
}>()

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const repos = useRepositories()
const session = useSessionStore()
const editBlocked = ref(false)
const banLabel = ref('')

const {
  word,
  translationLabels,
  rootLabels,
  constructionLabels,
  createdByName,
  mastery,
  masteryTarget,
  loading,
  error,
} = useWordDetail(() => props.wordId)

const createdAtLabel = computed(() => {
  const stamp = word.value?.createdAt
  if (typeof stamp !== 'string' || !stamp) return ''
  const date = new Date(stamp)
  if (Number.isNaN(date.getTime())) return stamp
  return date.toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' })
})

const masteryPercent = computed(() =>
  masteryTarget.value > 0 ? (mastery.value / masteryTarget.value) * 100 : 0,
)

function editWord() {
  if (props.embedded) {
    emit('edit')
    return
  }
  void router.push({
    name: 'word-edit',
    params: { wordId: props.wordId },
    query: { return: route.name === 'word-detail' ? 'detail' : 'card' },
  })
}

watch(
  () => session.user?.id,
  async (userId) => {
    editBlocked.value = false
    banLabel.value = ''
    if (!userId) return
    const ban = await activeEditBan(repos, userId)
    if (!ban) return
    editBlocked.value = true
    if (!ban.endsAt || typeof ban.endsAt !== 'string') {
      banLabel.value = t('words.bannedForever')
      return
    }
    const date = new Date(ban.endsAt)
    banLabel.value = t('words.bannedUntil', {
      date: Number.isNaN(date.getTime()) ? ban.endsAt : date.toLocaleString(locale.value, { dateStyle: 'medium' }),
    })
  },
  { immediate: true },
)
</script>

<template>
  <p v-if="loading" class="pixel-text-muted">{{ t('common.loading') }}</p>
  <p v-else-if="error" class="error">{{ error }}</p>
  <template v-else-if="word">
    <p class="headword"><WordGlyph :word="word" /></p>
    <p class="type pixel-text-muted">{{ t(`words.types.${word.type}`) }}</p>
    <p v-if="translationLabels.length" class="translations">
      {{ translationLabels.map((item) => item.label).join(', ') }}
    </p>
    <p v-if="rootLabels.length" class="related">
      <span class="related__label pixel-text-muted">{{ t('words.roots') }}</span>
      {{ rootLabels.map((item) => item.label).join(', ') }}
    </p>
    <p v-if="constructionLabels.length" class="related">
      <span class="related__label pixel-text-muted">{{ t('words.constructions') }}</span>
      {{ constructionLabels.map((item) => item.label).join(', ') }}
    </p>
    <PixelProgressBar
      class="mastery"
      :label="`${t('words.mastery')} (${mastery}/${masteryTarget})`"
      :value="masteryPercent"
    />
    <div class="actions">
      <PixelButton block variant="secondary" :disabled="editBlocked" @click="editWord">
        {{ t('words.edit') }}
      </PixelButton>
    </div>
    <p v-if="banLabel" class="error">{{ banLabel }}</p>
    <p class="origin pixel-text-muted">{{ createdByName }} · {{ createdAtLabel }}</p>
  </template>
</template>

<style scoped>
.headword {
  margin: 0 0 0.65rem;
  font-size: var(--pixel-font-size-md);
  text-align: left;
}

.translations {
  margin: 0 0 0.75rem;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.6;
  text-align: left;
}

.type {
  margin: -0.35rem 0 0.65rem;
  font-size: var(--pixel-font-size-xs);
  text-align: left;
}

.related {
  margin: 0 0 0.65rem;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.5;
  text-align: left;
}

.mastery {
  margin-bottom: 0.35rem;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.85rem;
}

.related__label {
  display: block;
}

.origin {
  margin: 0.75rem 0 0;
  font-size: 0.45rem;
  line-height: 1.4;
  text-align: left;
}

.error {
  color: var(--pixel-danger);
  font-size: var(--pixel-font-size-xs);
}
</style>
