<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import TextIconButton from '@/components/texts/TextIconButton.vue'
import PixelButton from '@/components/ui/PixelButton.vue'
import PixelDialog from '@/components/ui/PixelDialog.vue'
import PixelInput from '@/components/ui/PixelInput.vue'
import {
  deleteOwnFinalProposal,
  likeFinalProposal,
  sortFinalProposals,
  upsertOwnFinalProposal,
} from '@/domain/text/finalTranslationProposals'
import type { FinalTranslationProposal, ID } from '@/types/db'

const props = defineProps<{
  open: boolean
  proposals: FinalTranslationProposal[]
  userId: ID
  sourceText?: string
  sourceDir?: 'rtl' | 'ltr'
  translationDir?: 'rtl' | 'ltr'
  saving?: boolean
  error?: string
}>()

const emit = defineEmits<{
  close: []
  change: [proposals: FinalTranslationProposal[], reason: 'save' | 'like' | 'delete']
}>()

const { t } = useI18n()
const draft = ref('')
const editingId = ref<ID | null>(null)

watch(
  () => props.open,
  (open) => {
    if (open) return
    draft.value = ''
    editingId.value = null
  },
)

const sorted = computed(() => sortFinalProposals(props.proposals))

const canSave = computed(() => draft.value.trim().length > 0)

function commit() {
  if (!canSave.value || props.saving) return
  emit(
    'change',
    upsertOwnFinalProposal(props.proposals, props.userId, draft.value, editingId.value),
    'save',
  )
  draft.value = ''
  editingId.value = null
}

function startEdit(item: FinalTranslationProposal) {
  if (item.addedBy !== props.userId) return
  editingId.value = item.id
  draft.value = item.text
}

function remove(item: FinalTranslationProposal) {
  emit('change', deleteOwnFinalProposal(props.proposals, item.id, props.userId), 'delete')
  if (editingId.value === item.id) {
    editingId.value = null
    draft.value = ''
  }
}

function like(item: FinalTranslationProposal) {
  emit('change', likeFinalProposal(props.proposals, item.id, props.userId), 'like')
}
</script>

<template>
  <PixelDialog
    :open="open"
    placement="center"
    :title="t('analysis.finalTranslationTitle')"
    @close="emit('close')"
  >
    <p v-if="sourceText" class="source pixel-text-muted" :dir="sourceDir">{{ sourceText }}</p>
    <div :dir="translationDir">
    <PixelInput
      v-model="draft"
      multiline
      :placeholder="t('analysis.finalTranslationPlaceholder')"
      :disabled="saving"
    >
      <template #suffix>
        <PixelButton
          class="save"
          :class="{ 'save--busy': saving }"
          square
          :disabled="(!canSave && !saving) || saving"
          :aria-busy="saving"
          :aria-label="saving ? t('common.saving') : t('common.save')"
          @click="commit"
        >
          <span v-if="saving" class="save__spin" aria-hidden="true" />
          <svg v-else class="save__check" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M3.2 8.2L6.4 11.4 12.8 4.6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </PixelButton>
      </template>
    </PixelInput>
    </div>
    <p v-if="error" class="error">{{ error }}</p>

    <p v-if="sorted.length === 0" class="empty pixel-text-muted">{{ t('analysis.finalProposalsEmpty') }}</p>
    <ul v-else class="list">
      <li v-for="item in sorted" :key="item.id" class="row">
        <p class="text">{{ item.text }}</p>
        <div v-if="item.addedBy === userId" class="actions">
          <TextIconButton name="edit" :label="t('analysis.editFinal')" @click="startEdit(item)" />
          <TextIconButton name="close" :label="t('common.delete')" @click="remove(item)" />
        </div>
        <TextIconButton
          v-else
          name="like"
          tone="like"
          :active="(item.likedBy ?? []).includes(userId)"
          :count="(item.likedBy ?? []).length"
          :label="t('texts.like')"
          @click="like(item)"
        />
      </li>
    </ul>
  </PixelDialog>
</template>

<style scoped>
.source {
  margin: 0 0 0.75rem;
  white-space: pre-wrap;
  font-size: var(--pixel-font-size-sm);
  line-height: 1.45;
}

.error {
  margin: 0.5rem 0 0;
  color: var(--pixel-danger);
  font-size: var(--pixel-font-size-xs);
}

.empty {
  margin: 0.85rem 0 0;
  font-size: var(--pixel-font-size-xs);
}

.list {
  list-style: none;
  margin: 0.85rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 0.7rem;
  background: var(--pixel-surface);
  border-radius: var(--pixel-radius-sm);
}

.text {
  flex: 1;
  min-width: 0;
  margin: 0;
  white-space: pre-wrap;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.45;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  flex: 0 0 auto;
  align-self: center;
}

.save {
  align-self: flex-start;
  height: 2.6rem;
  min-height: 2.6rem;
}

.save__check {
  width: 1.15rem;
  height: 1.15rem;
  display: block;
}

.save--busy {
  opacity: 1;
  cursor: wait;
}

.save__spin {
  width: 1rem;
  height: 1rem;
  border: 2px solid color-mix(in srgb, var(--pixel-on-accent) 32%, transparent);
  border-top-color: var(--pixel-on-accent);
  border-radius: 50%;
  animation: save-spin 0.7s linear infinite;
}

@keyframes save-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .save__spin {
    animation: none;
    border-color: var(--pixel-on-accent);
  }
}
</style>
