<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useRepositories } from '@/composables/useRepositories'
import {
  createUserSeries,
  deleteUserSeries,
  renameUserSeries,
} from '@/services/seriesService'
import { useSessionStore } from '@/stores/session'
import type { TextSeries } from '@/types/db'
import PixelButton from '@/components/ui/PixelButton.vue'
import PixelDialog from '@/components/ui/PixelDialog.vue'
import PixelInput from '@/components/ui/PixelInput.vue'
import PixelSelect from '@/components/ui/PixelSelect.vue'

const seriesId = defineModel<string>({ default: '' })

const { t } = useI18n()
const session = useSessionStore()
const repos = useRepositories()

const items = ref<TextSeries[]>([])
const loaded = ref(false)
const composing = ref(false)
const draftName = ref('')
const saving = ref(false)
const manageOpen = ref(false)
const renameDrafts = ref<Record<string, string>>({})
const busyId = ref('')
const error = ref('')

const hasSeries = computed(() => items.value.length > 0)
const showComposer = computed(() => loaded.value && (!hasSeries.value || composing.value))

const selectOptions = computed(() => [
  { value: '', label: t('analysis.seriesNone') },
  ...items.value.map((item) => ({ value: item.id, label: item.title })),
])

async function reload() {
  const uid = session.user?.id
  if (!uid) {
    items.value = []
    loaded.value = true
    return
  }
  try {
    items.value = await repos.series.listByAuthor(uid)
  } catch {
    items.value = items.value.filter((item) => item.authorId === uid)
  }
  if (seriesId.value && !items.value.some((item) => item.id === seriesId.value)) {
    const found = await repos.series.getById(seriesId.value).catch(() => null)
    if (found && found.authorId === uid) items.value = [...items.value, found]
    else seriesId.value = ''
  }
  items.value = [...items.value].sort((a, b) => a.title.localeCompare(b.title))
  if (items.value.length) composing.value = false
  else composing.value = true
  renameDrafts.value = Object.fromEntries(items.value.map((item) => [item.id, item.title]))
  loaded.value = true
}

watch(
  () => session.user?.id,
  () => {
    void reload()
  },
  { immediate: true },
)

async function saveNew() {
  const uid = session.user?.id
  const name = draftName.value.trim()
  error.value = ''
  if (saving.value) return
  if (!name) {
    if (hasSeries.value) composing.value = false
    return
  }
  if (!uid) return
  saving.value = true
  try {
    const created = await createUserSeries(repos, uid, name)
    draftName.value = ''
    if (!items.value.some((item) => item.id === created.id)) {
      items.value = [...items.value, created]
    }
    seriesId.value = created.id
    composing.value = false
    await reload()
    seriesId.value = created.id
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Series save failed'
    throw e
  } finally {
    saving.value = false
  }
}

async function flush(): Promise<string> {
  if (draftName.value.trim()) await saveNew()
  return seriesId.value
}

defineExpose({ flush })

function startAdd() {
  composing.value = true
  draftName.value = ''
}

async function saveRename(id: string) {
  const uid = session.user?.id
  const name = (renameDrafts.value[id] ?? '').trim()
  if (!uid || !name || busyId.value) return
  busyId.value = id
  try {
    await renameUserSeries(repos, id, uid, name)
    await reload()
  } finally {
    busyId.value = ''
  }
}

async function removeSeries(id: string) {
  const uid = session.user?.id
  if (!uid || busyId.value) return
  busyId.value = id
  try {
    await deleteUserSeries(repos, id, uid)
    if (seriesId.value === id) seriesId.value = ''
    await reload()
    if (!items.value.length) manageOpen.value = false
  } finally {
    busyId.value = ''
  }
}
</script>

<template>
  <div class="series-field">
    <PixelInput
      v-if="showComposer"
      v-model="draftName"
      :label="t('analysis.seriesLabel')"
      :placeholder="t('analysis.seriesPlaceholder')"
      :disabled="saving"
      @keyup.enter="saveNew"
    >
      <template #suffix>
        <PixelButton
          square
          :disabled="saving || (!draftName.trim() && !hasSeries)"
          :aria-busy="saving"
          :aria-label="t('common.save')"
          @click="saveNew"
        >
          <span v-if="saving" class="spin" aria-hidden="true" />
          <svg v-else class="glyph" viewBox="0 0 16 16" aria-hidden="true">
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

    <PixelSelect
      v-else
      v-model="seriesId"
      :label="t('analysis.seriesLabel')"
      :options="selectOptions"
      :disabled="!loaded"
    >
      <template #suffix>
        <PixelButton
          v-if="hasSeries"
          square
          variant="secondary"
          :aria-label="t('analysis.seriesAdd')"
          @click="startAdd"
        >
          <svg class="glyph" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M8 3.4v9.2M3.4 8h9.2"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </PixelButton>
        <PixelButton
          v-if="hasSeries"
          square
          variant="secondary"
          :aria-label="t('analysis.seriesEdit')"
          @click="manageOpen = true"
        >
          <svg class="glyph" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M9.4 3.6l2.9 2.9M3 13l.7-3.3L10.6 3c.4-.4 1-.4 1.4 0l.9.9c.4.4.4 1 0 1.4L6.3 12.3 3 13z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linejoin="round"
            />
          </svg>
        </PixelButton>
      </template>
    </PixelSelect>
    <p v-if="error" class="series-error">{{ error }}</p>

    <PixelDialog
      :open="manageOpen"
      placement="center"
      :title="t('analysis.seriesManage')"
      @close="manageOpen = false"
    >
      <ul class="manage">
        <li v-for="item in items" :key="item.id" class="manage__row">
          <input
            v-model="renameDrafts[item.id]"
            class="manage__input pixel-box"
            :disabled="busyId === item.id"
            :aria-label="t('analysis.seriesLabel')"
          />
          <PixelButton
            square
            :disabled="busyId === item.id || !(renameDrafts[item.id] ?? '').trim()"
            :aria-label="t('common.save')"
            @click="saveRename(item.id)"
          >
            <span v-if="busyId === item.id" class="spin" aria-hidden="true" />
            <svg v-else class="glyph" viewBox="0 0 16 16" aria-hidden="true">
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
          <PixelButton
            square
            variant="danger"
            :disabled="Boolean(busyId)"
            :aria-label="t('analysis.seriesDelete')"
            @click="removeSeries(item.id)"
          >
            <svg class="glyph" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4 5.2h8M6.2 5.2V4.1h3.6v1.1M5.3 5.2l.5 7.2h4.4l.5-7.2"
                fill="none"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </PixelButton>
        </li>
      </ul>
    </PixelDialog>
  </div>
</template>

<style scoped>
.series-error {
  margin: 0.35rem 0 0;
  color: var(--pixel-danger);
  font-size: var(--pixel-font-size-xs);
}

.glyph {
  width: 1.15rem;
  height: 1.15rem;
  display: block;
}

.spin {
  width: 1rem;
  height: 1rem;
  border: 2px solid color-mix(in srgb, currentColor 32%, transparent);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: series-spin 0.7s linear infinite;
}

.manage {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.manage__row {
  display: flex;
  align-items: stretch;
  gap: 0.45rem;
}

.manage__input {
  flex: 1;
  min-width: 0;
  font-size: var(--pixel-font-size-xs);
  padding: 0.7rem 0.8rem;
  color: var(--pixel-text);
  background: var(--pixel-bg);
  border-radius: var(--pixel-radius-sm);
}

@keyframes series-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>
