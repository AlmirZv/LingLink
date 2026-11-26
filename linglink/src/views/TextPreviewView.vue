<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import TextIconButton from '@/components/texts/TextIconButton.vue'
import TextReaderBody from '@/components/texts/TextReaderBody.vue'
import PixelButton from '@/components/ui/PixelButton.vue'
import PixelCard from '@/components/ui/PixelCard.vue'
import PixelDialog from '@/components/ui/PixelDialog.vue'
import { rememberLibraryReturn } from '@/composables/useLibraryReturn'
import { usePageHeader } from '@/composables/usePageHeader'
import { useRepositories } from '@/composables/useRepositories'
import { useTextDetail } from '@/composables/useTextDetail'
import { useTextEngagement } from '@/composables/useTextEngagement'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const session = useSessionStore()
const repos = useRepositories()

const textId = computed(() => route.params.id as string)
const { text, loading, error } = useTextDetail(() => textId.value)
const { views, likes, comments, edits } = useTextEngagement(() => text.value)

usePageHeader(() => ({
  title: text.value?.title ?? null,
  metrics:
    text.value && text.value.status !== 'draft'
      ? { views: views.value, likes: likes.value, edits: edits.value, comments: comments.value }
      : null,
  onBack: goBack,
}))

const deleteOpen = ref(false)
const deleting = ref(false)
const hiding = ref(false)

const isDraft = computed(() => text.value?.status === 'draft')
const isAuthor = computed(
  () => Boolean(text.value && session.user?.id && text.value.authorId === session.user.id),
)
const isAuthorManaged = computed(
  () =>
    Boolean(
      isAuthor.value &&
        text.value &&
        (text.value.status === 'published' || text.value.status === 'hidden'),
    ),
)

function goBack() {
  if (route.query.from === 'me') {
    void router.push({ name: 'my-texts' })
    return
  }
  if (window.history.state?.back) {
    router.back()
    return
  }
  void router.push({ name: 'texts' })
}

function openSupplement() {
  rememberLibraryReturn(textId.value, route)
  void router.push({ name: 'text-supplement', params: { id: textId.value }, query: route.query })
}

function editSource() {
  void router.push({ name: 'text-source', params: { id: textId.value }, query: route.query })
}

function continueDraft() {
  void router.push({ name: 'text-translate', params: { id: textId.value } })
}

async function toggleHidden() {
  if (!text.value || hiding.value) return
  hiding.value = true
  try {
    text.value = await repos.texts.update({
      ...text.value,
      status: text.value.status === 'hidden' ? 'published' : 'hidden',
      updatedAt: new Date().toISOString(),
    })
  } finally {
    hiding.value = false
  }
}

async function removeText() {
  if (!text.value || deleting.value) return
  deleting.value = true
  try {
    await repos.texts.update({
      ...text.value,
      status: 'deleted',
      updatedAt: new Date().toISOString(),
    })
    deleteOpen.value = false
    void router.push({ name: 'my-texts' })
  } finally {
    deleting.value = false
  }
}

</script>

<template>
  <div class="reading">
    <p v-if="loading && !text" class="pixel-text-muted">{{ t('common.loading') }}</p>
    <p v-else-if="error" class="error">{{ error }}</p>

    <PixelCard v-else-if="text && isDraft" :title="text.title">
      <p class="draft-tag pixel-text-muted">{{ t('translation.draftLabel') }}</p>
      <div class="actions">
        <PixelButton v-if="isAuthor" block @click="continueDraft">
          {{ t('translation.continueTranslate') }}
        </PixelButton>
      </div>
    </PixelCard>

    <TextReaderBody v-else-if="text" :text="text" @update:text="text = $event">
      <template #extra-actions>
        <PixelButton v-if="!isAuthorManaged" variant="secondary" @click="openSupplement">
          {{ t('texts.supplement') }}
        </PixelButton>
        <TextIconButton v-if="isAuthorManaged" name="edit" :label="t('texts.edit')" @click="editSource" />
        <TextIconButton
          v-if="isAuthorManaged"
          :name="text.status === 'hidden' ? 'show' : 'hide'"
          :disabled="hiding"
          :label="text.status === 'hidden' ? t('texts.show') : t('texts.hide')"
          @click="toggleHidden"
        />
        <TextIconButton
          v-if="isAuthorManaged"
          name="delete"
          tone="danger"
          :label="t('texts.delete')"
          @click="deleteOpen = true"
        />
      </template>
    </TextReaderBody>

    <PixelDialog :open="deleteOpen" :title="t('texts.deleteTitle')" @close="deleteOpen = false">
      <p class="delete-body">{{ t('texts.deleteBody') }}</p>
      <PixelButton class="dialog-btn" variant="danger" block :disabled="deleting" @click="removeText">
        {{ t('texts.delete') }}
      </PixelButton>
      <PixelButton class="dialog-btn" variant="secondary" block @click="deleteOpen = false">
        {{ t('common.cancel') }}
      </PixelButton>
    </PixelDialog>
  </div>
</template>

<style scoped>
.reading {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.draft-tag {
  margin: 0;
  font-size: var(--pixel-font-size-xs);
}

.dialog-btn {
  margin-top: 0.75rem;
}

.error {
  color: var(--pixel-danger);
  font-size: var(--pixel-font-size-xs);
}

.delete-body {
  margin: 0;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.5;
}
</style>
