<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import WordFieldList from '@/components/words/WordFieldList.vue'
import PixelButton from '@/components/ui/PixelButton.vue'
import { usesCharacterScript } from '@/domain/words/characterReading'
import { useLanguageContext } from '@/composables/useLanguageContext'
import { useRepositories } from '@/composables/useRepositories'
import {
  activeTranslationBan,
  loadTranslationChoices,
  translationBanLabel,
  voteWordTranslation,
  type TranslationChoice,
} from '@/services/translationChoices'
import {
  activeFieldBan,
  addReadingVariant,
  loadLinkChoices,
  loadReadingChoices,
  voteLink,
  voteReading,
  type LinkField,
  type ReadingField,
} from '@/services/wordFieldChoices'
import { useSessionStore } from '@/stores/session'
import type { EditBan, GrammarConstruction, Word } from '@/types/db'

type ListKey = ReadingField | 'translation' | LinkField

const props = defineProps<{
  wordId?: string
}>()

const emit = defineEmits<{
  back: []
}>()

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const repos = useRepositories()
const session = useSessionStore()
const { learningLanguage, translationTargetForText } = useLanguageContext()

const activeWordId = computed(() => props.wordId || (route.params.wordId as string))
const embedded = computed(() => Boolean(props.wordId))
const word = ref<Word | null>(null)
const choices = ref<TranslationChoice[]>([])
const characterChoices = ref<TranslationChoice[]>([])
const furiganaChoices = ref<TranslationChoice[]>([])
const rootChoices = ref<TranslationChoice[]>([])
const constructionChoices = ref<TranslationChoice[]>([])
const loading = ref(true)
const saving = ref(false)
const message = ref('')
const errorText = ref('')
const translationBan = ref<EditBan | null>(null)
const characterBan = ref<EditBan | null>(null)
const furiganaBan = ref<EditBan | null>(null)

const expanded = reactive<Record<ListKey, boolean>>({
  character: false,
  furigana: false,
  translation: false,
  root: false,
  construction: false,
})
const adding = reactive<Record<ListKey, boolean>>({
  character: false,
  furigana: false,
  translation: false,
  root: false,
  construction: false,
})
const drafts = reactive<Record<ListKey, string>>({
  character: '',
  furigana: '',
  translation: '',
  root: '',
  construction: '',
})

const targetLanguage = computed(() =>
  translationTargetForText(word.value?.language ?? learningLanguage.value),
)
const showReading = computed(() => (word.value ? usesCharacterScript(word.value.language) : false))

const stamp = () => new Date().toISOString()

function banText(ban: EditBan | null, kind: 'translation' | 'field'): string {
  const banned = kind === 'translation' ? 'words.translationBanned' : 'words.fieldBanned'
  const until = kind === 'translation' ? 'words.translationBannedUntil' : 'words.fieldBannedUntil'
  return translationBanLabel(
    ban,
    (key, values) => (key.endsWith('Until') ? t(until, values ?? {}) : t(banned)),
    locale.value,
  )
}

function resetDrafts() {
  for (const key of Object.keys(drafts) as ListKey[]) {
    expanded[key] = false
    adding[key] = false
    drafts[key] = ''
  }
}

function toggleAdd(key: ListKey) {
  adding[key] = !adding[key]
  if (!adding[key]) drafts[key] = ''
}

async function reload(keepForm = false) {
  loading.value = true
  if (!keepForm) {
    message.value = ''
    resetDrafts()
  }
  errorText.value = ''
  const loadedWord = await repos.words.getById(activeWordId.value)
  if (!loadedWord) {
    word.value = null
    loading.value = false
    return
  }
  const userId = session.user?.id
  let current = loadedWord
  if (usesCharacterScript(current.language)) {
    const kanji = await loadReadingChoices(repos, current, 'character', userId)
    current = kanji.word
    characterChoices.value = kanji.choices
    const reading = await loadReadingChoices(repos, current, 'furigana', userId)
    current = reading.word
    furiganaChoices.value = reading.choices
  } else {
    characterChoices.value = []
    furiganaChoices.value = []
  }
  const target = translationTargetForText(current.language)
  const rootWords = await repos.words.listByIds(current.rootWords)
  const constructionRows = (await Promise.all(current.grammarConstructions.map((id) => repos.constructions.getById(id))))
    .flatMap((item) => (item ? [{ id: item.id, label: item.construction }] : []))
  const [translations, roots, constructions, translationBanRow, characterBanRow, furiganaBanRow] = await Promise.all([
    loadTranslationChoices(repos, current, target, userId),
    loadLinkChoices(repos, current, 'root', rootWords.map((item) => ({ id: item.id, label: item.word })), userId),
    loadLinkChoices(repos, current, 'construction', constructionRows, userId),
    userId ? activeTranslationBan(repos, userId, current.id) : Promise.resolve(null),
    userId ? activeFieldBan(repos, userId, current.id, 'character') : Promise.resolve(null),
    userId ? activeFieldBan(repos, userId, current.id, 'furigana') : Promise.resolve(null),
  ])
  word.value = current
  choices.value = translations
  rootChoices.value = roots
  constructionChoices.value = constructions
  translationBan.value = translationBanRow
  characterBan.value = characterBanRow
  furiganaBan.value = furiganaBanRow
  loading.value = false
}

watch(activeWordId, () => void reload(), { immediate: true })

async function voteTranslation(id: string, value: 1 | -1) {
  const userId = session.user?.id
  const source = word.value
  if (!userId || !source) return
  const result = await voteWordTranslation(repos, source.id, id, userId, value)
  if (result.removed) message.value = t('words.translationRemoved')
  await reload(true)
}

async function voteCharacters(id: string, value: 1 | -1) {
  await voteField('character', id, value)
}

async function voteFurigana(id: string, value: 1 | -1) {
  await voteField('furigana', id, value)
}

async function voteField(field: ReadingField, id: string, value: 1 | -1) {
  const userId = session.user?.id
  const source = word.value
  if (!userId || !source) return
  const result = await voteReading(repos, source.id, field, id, userId, value)
  if (result.removed) message.value = t('words.fieldRemoved')
  await reload(true)
}

async function voteRoots(id: string, value: 1 | -1) {
  await voteLinked('root', id, value)
}

async function voteConstructions(id: string, value: 1 | -1) {
  await voteLinked('construction', id, value)
}

async function voteLinked(field: LinkField, id: string, value: 1 | -1) {
  const userId = session.user?.id
  const source = word.value
  if (!userId || !source) return
  const result = await voteLink(repos, source.id, field, id, userId, value)
  if (result.removed) message.value = t('words.fieldRemoved')
  await reload(true)
}

async function save() {
  const source = word.value
  const userId = session.user?.id
  if (!source || !userId || saving.value) return
  const kanji = drafts.character.trim()
  const reading = drafts.furigana.trim()
  const typed = drafts.translation.trim()
  const rootText = drafts.root.trim()
  const constructionText = drafts.construction.trim()
  if (kanji && characterBan.value) {
    errorText.value = banText(characterBan.value, 'field')
    return
  }
  if (reading && furiganaBan.value) {
    errorText.value = banText(furiganaBan.value, 'field')
    return
  }
  if (typed && translationBan.value) {
    errorText.value = banText(translationBan.value, 'translation')
    return
  }
  saving.value = true
  errorText.value = ''
  try {
    let next = source
    if (showReading.value && kanji) {
      const added = addReadingVariant(next, 'character', kanji, userId)
      if (added === 'duplicate') {
        errorText.value = t('words.duplicateItem')
        return
      }
      next = await repos.words.update(added)
    }
    if (showReading.value && reading) {
      const added = addReadingVariant(next, 'furigana', reading, userId)
      if (added === 'duplicate') {
        errorText.value = t('words.duplicateItem')
        return
      }
      next = await repos.words.update(added)
    }
    if (typed) {
      const draft: Word = {
        id: `word-${crypto.randomUUID()}`,
        language: targetLanguage.value,
        word: typed,
        translations: { [next.language]: [next.id] },
        type: 'other',
        rootWords: [],
        grammarConstructions: [],
        createdBy: userId,
        createdAt: stamp(),
        updatedAt: stamp(),
      }
      const stored = await repos.words.create(draft)
      const links = { ...next.translations }
      const list = links[targetLanguage.value] ? [...links[targetLanguage.value]!] : []
      if (!list.includes(stored.id)) list.push(stored.id)
      links[targetLanguage.value] = list
      next = await repos.words.update({ ...next, translations: links, updatedAt: stamp() })
    }
    if (rootText) {
      const root: Word = {
        id: `word-${crypto.randomUUID()}`,
        language: next.language,
        word: rootText,
        translations: {},
        type: 'other',
        rootWords: [next.id],
        grammarConstructions: [],
        createdBy: userId,
        createdAt: stamp(),
        updatedAt: stamp(),
      }
      const storedRoot = await repos.words.create(root)
      const rootWords = next.rootWords.includes(storedRoot.id) ? next.rootWords : [...next.rootWords, storedRoot.id]
      next = await repos.words.update({ ...next, rootWords, updatedAt: stamp() })
    }
    if (constructionText) {
      const construction: GrammarConstruction = {
        id: `gc-${crypto.randomUUID()}`,
        language: next.language,
        construction: constructionText,
        forms: [constructionText],
        translations: {},
        type: 'other',
        relatedWords: [next.id],
        createdBy: userId,
        createdAt: stamp(),
        updatedAt: stamp(),
      }
      const stored = await repos.constructions.create(construction)
      const grammarConstructions = next.grammarConstructions.includes(stored.id)
        ? next.grammarConstructions
        : [...next.grammarConstructions, stored.id]
      next = await repos.words.update({ ...next, grammarConstructions, updatedAt: stamp() })
    }
    word.value = next
    message.value = t('words.changesSaved')
    drafts.character = ''
    drafts.furigana = ''
    drafts.translation = ''
    drafts.root = ''
    drafts.construction = ''
    adding.character = false
    adding.furigana = false
    adding.translation = false
    adding.root = false
    adding.construction = false
    await reload(true)
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : t('analysis.saveFailed')
  } finally {
    saving.value = false
  }
}

function goBack() {
  if (embedded.value) {
    emit('back')
    return
  }
  const id = activeWordId.value
  if (route.query.return === 'detail') {
    void router.push({ name: 'word-detail', params: { wordId: id } })
    return
  }
  void router.push({ name: 'words', query: { open: id } })
}
</script>

<template>
  <p v-if="loading && !word" class="pixel-text-muted">{{ t('common.loading') }}</p>
  <p v-else-if="!word" class="error">{{ t('words.editErrors.missing') }}</p>
  <div v-else class="editor">
    <p class="hint">{{ word.word }}</p>
    <p v-if="message" class="hint">{{ message }}</p>

    <WordFieldList
      v-if="showReading"
      v-model:draft="drafts.character"
      :label="t('analysis.kanjiLabel')"
      :items="characterChoices.map((item) => item.label)"
      :options="characterChoices"
      :expanded="expanded.character"
      :adding="adding.character"
      :add-label="t('words.addKanji')"
      :expand-label="t('words.expandList')"
      :collapse-label="t('words.collapseList')"
      :like-label="t('texts.like')"
      :dislike-label="t('texts.dislike')"
      :empty-label="t('words.listEmpty')"
      :placeholder="t('analysis.optional')"
      :ban-label="banText(characterBan, 'field')"
      @toggle="expanded.character = !expanded.character"
      @plus="toggleAdd('character')"
      @vote="voteCharacters"
    />
    <WordFieldList
      v-if="showReading"
      v-model:draft="drafts.furigana"
      :label="t('analysis.furiganaLabel')"
      :items="furiganaChoices.map((item) => item.label)"
      :options="furiganaChoices"
      :expanded="expanded.furigana"
      :adding="adding.furigana"
      :add-label="t('words.addFurigana')"
      :expand-label="t('words.expandList')"
      :collapse-label="t('words.collapseList')"
      :like-label="t('texts.like')"
      :dislike-label="t('texts.dislike')"
      :empty-label="t('words.listEmpty')"
      :placeholder="t('analysis.optional')"
      :ban-label="banText(furiganaBan, 'field')"
      @toggle="expanded.furigana = !expanded.furigana"
      @plus="toggleAdd('furigana')"
      @vote="voteFurigana"
    />
    <WordFieldList
      v-model:draft="drafts.translation"
      :label="t('analysis.translationLabel')"
      :items="choices.map((item) => item.label)"
      :options="choices"
      :expanded="expanded.translation"
      :adding="adding.translation"
      :add-label="t('words.addTranslation')"
      :expand-label="t('words.expandList')"
      :collapse-label="t('words.collapseList')"
      :like-label="t('texts.like')"
      :dislike-label="t('texts.dislike')"
      :empty-label="t('words.listEmpty')"
      :placeholder="targetLanguage"
      :ban-label="banText(translationBan, 'translation')"
      @toggle="expanded.translation = !expanded.translation"
      @plus="toggleAdd('translation')"
      @vote="voteTranslation"
    />
    <WordFieldList
      v-model:draft="drafts.root"
      :label="t('analysis.rootsLabel')"
      :items="rootChoices.map((item) => item.label)"
      :options="rootChoices"
      :expanded="expanded.root"
      :adding="adding.root"
      :add-label="t('words.addRoot')"
      :expand-label="t('words.expandList')"
      :collapse-label="t('words.collapseList')"
      :like-label="t('texts.like')"
      :dislike-label="t('texts.dislike')"
      :empty-label="t('words.listEmpty')"
      :placeholder="t('analysis.optional')"
      @toggle="expanded.root = !expanded.root"
      @plus="toggleAdd('root')"
      @vote="voteRoots"
    />
    <WordFieldList
      v-model:draft="drafts.construction"
      :label="t('analysis.constructionsLabel')"
      :items="constructionChoices.map((item) => item.label)"
      :options="constructionChoices"
      :expanded="expanded.construction"
      :adding="adding.construction"
      :add-label="t('analysis.addConstruction')"
      :expand-label="t('words.expandList')"
      :collapse-label="t('words.collapseList')"
      :like-label="t('texts.like')"
      :dislike-label="t('texts.dislike')"
      :empty-label="t('words.listEmpty')"
      :placeholder="t('analysis.optional')"
      @toggle="expanded.construction = !expanded.construction"
      @plus="toggleAdd('construction')"
      @vote="voteConstructions"
    />

    <p v-if="errorText" class="error">{{ errorText }}</p>
    <div class="actions">
      <PixelButton :disabled="saving" @click="save">
        {{ saving ? t('common.loading') : t('common.save') }}
      </PixelButton>
      <PixelButton variant="secondary" @click="goBack">{{ t('common.cancel') }}</PixelButton>
    </div>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
}

.hint {
  margin: 0;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.5;
}

.actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.9rem;
}

.actions :deep(.pixel-btn) {
  flex: 1;
  width: auto;
}

.error {
  margin: 0.75rem 0 0;
  color: var(--pixel-danger);
  font-size: var(--pixel-font-size-xs);
}
</style>
