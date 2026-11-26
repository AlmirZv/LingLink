<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import TextIconButton from '@/components/texts/TextIconButton.vue'
import { setTextCommentCount } from '@/composables/useTextEngagement'
import { useRepositories } from '@/composables/useRepositories'
import { useSessionStore } from '@/stores/session'
import type { ID, TextComment } from '@/types/db'

const props = defineProps<{
  textId: string
}>()

const emit = defineEmits<{
  count: [value: number]
}>()

const { t, locale } = useI18n()
const session = useSessionStore()
const repos = useRepositories()

const comments = ref<TextComment[]>([])
const reactions = ref<Record<string, 'like' | 'dislike'>>({})
const names = ref<Record<string, string>>({})
const draft = ref('')
const replying = ref<{ rootId: ID; authorId: ID; name: string; mention: boolean } | null>(null)
const sending = ref(false)
const loadError = ref('')

const roots = computed(() => comments.value.filter((comment) => !comment.parentId))

function repliesOf(id: ID): TextComment[] {
  return comments.value.filter((comment) => comment.parentId === id)
}

function nameOf(id: ID | undefined): string {
  if (!id) return ''
  return names.value[id] ?? id
}

function when(value: TextComment['createdAt']): string {
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(locale.value, { day: 'numeric', month: 'short' })
}

async function rememberNames(ids: ID[]): Promise<void> {
  const missing = [...new Set(ids)].filter((id) => !names.value[id])
  if (!missing.length) return
  const loaded = await Promise.all(
    missing.map(async (id) => {
      const user = await repos.users.getById(id)
      return [id, user?.displayName ?? id] as const
    }),
  )
  names.value = { ...names.value, ...Object.fromEntries(loaded) }
}

async function load(): Promise<void> {
  loadError.value = ''
  const userId = session.user?.id
  try {
    const [rows, mine] = await Promise.all([
      repos.comments.listForText(props.textId),
      userId ? repos.comments.reactionsFor(userId, props.textId) : Promise.resolve({}),
    ])
    comments.value = rows
    reactions.value = mine
    await rememberNames(rows.flatMap((comment) => [comment.authorId, comment.replyToAuthorId].filter(Boolean) as ID[]))
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : t('common.loading')
  }
}

watch(() => props.textId, () => void load(), { immediate: true })
watch(
  comments,
  (rows) => {
    emit('count', rows.length)
    setTextCommentCount(props.textId, rows.length)
  },
  { immediate: true },
)

const inputId = computed(() => `text-comment-input-${props.textId}`)

function focusComposer(): void {
  document.getElementById(inputId.value)?.focus()
}

function startReply(root: TextComment, target: TextComment): void {
  replying.value = {
    rootId: root.id,
    authorId: target.authorId,
    name: nameOf(target.authorId),
    mention: target.id !== root.id,
  }
  focusComposer()
}

async function send(): Promise<void> {
  const body = draft.value.trim()
  const userId = session.user?.id
  if (!body || !userId || sending.value) return
  sending.value = true
  loadError.value = ''
  try {
    const reply = replying.value
    const created = await repos.comments.add({
      textId: props.textId,
      authorId: userId,
      body,
      parentId: reply?.rootId ?? null,
      replyToAuthorId: reply?.mention ? reply.authorId : undefined,
    })
    comments.value = [...comments.value, created]
    await rememberNames([userId])
    draft.value = ''
    replying.value = null
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : t('common.loading')
  } finally {
    sending.value = false
  }
}

async function react(comment: TextComment, reaction: 'like' | 'dislike'): Promise<void> {
  const userId = session.user?.id
  if (!userId) return
  const updated = await repos.comments.toggleReaction(userId, props.textId, comment.id, reaction)
  if (!updated) return
  comments.value = comments.value.map((item) => (item.id === updated.id ? updated : item))
  const next = { ...reactions.value }
  if (reactions.value[comment.id] === reaction) delete next[comment.id]
  else next[comment.id] = reaction
  reactions.value = next
}

defineExpose({ focusComposer })
</script>

<template>
  <section id="text-comments" class="comments">
    <h2 class="comments__title">{{ t('texts.comments') }}</h2>
    <p v-if="replying" class="replying">
      <span>{{ t('texts.replyTo', { name: replying.name }) }}</span>
      <button type="button" class="replying__cancel" @click="replying = null">×</button>
    </p>
    <form class="composer" @submit.prevent="send">
      <textarea
        :id="inputId"
        v-model="draft"
        class="composer__input pixel-box"
        rows="2"
        maxlength="500"
        :placeholder="t('texts.commentPlaceholder')"
      />
      <TextIconButton name="send" :label="t('texts.sendComment')" :disabled="sending || !draft.trim()" @click="send" />
    </form>
    <p v-if="loadError" class="comments__error">{{ loadError }}</p>
    <p v-else-if="!roots.length" class="comments__empty pixel-text-muted">{{ t('texts.noComments') }}</p>

    <ul v-else class="thread">
      <li v-for="comment in roots" :key="comment.id" class="thread__item">
        <article class="comment">
          <header class="comment__meta">
            <span>{{ nameOf(comment.authorId) }}</span>
            <time>{{ when(comment.createdAt) }}</time>
          </header>
          <p class="comment__body">{{ comment.body }}</p>
          <div class="comment__actions">
            <TextIconButton
              name="like"
              tone="like"
              :active="reactions[comment.id] === 'like'"
              :count="comment.likesCount"
              :label="t('texts.like')"
              @click="react(comment, 'like')"
            />
            <TextIconButton
              name="dislike"
              tone="dislike"
              :active="reactions[comment.id] === 'dislike'"
              :count="comment.dislikesCount"
              :label="t('texts.dislike')"
              @click="react(comment, 'dislike')"
            />
            <TextIconButton name="reply" :label="t('texts.reply')" @click="startReply(comment, comment)" />
          </div>
        </article>
        <ul v-if="repliesOf(comment.id).length" class="replies">
          <li v-for="reply in repliesOf(comment.id)" :key="reply.id">
            <article class="comment">
              <header class="comment__meta">
                <span>{{ nameOf(reply.authorId) }}</span>
                <time>{{ when(reply.createdAt) }}</time>
              </header>
              <p class="comment__body">
                <span v-if="reply.replyToAuthorId" class="comment__mention">{{ nameOf(reply.replyToAuthorId) }}</span>
                {{ reply.body }}
              </p>
              <div class="comment__actions">
                <TextIconButton
                  name="like"
                  tone="like"
                  :active="reactions[reply.id] === 'like'"
                  :count="reply.likesCount"
                  :label="t('texts.like')"
                  @click="react(reply, 'like')"
                />
                <TextIconButton
                  name="dislike"
                  tone="dislike"
                  :active="reactions[reply.id] === 'dislike'"
                  :count="reply.dislikesCount"
                  :label="t('texts.dislike')"
                  @click="react(reply, 'dislike')"
                />
                <TextIconButton name="reply" :label="t('texts.reply')" @click="startReply(comment, reply)" />
              </div>
            </article>
          </li>
        </ul>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.comments {
  scroll-margin-bottom: 5.5rem;
  padding-top: 0.15rem;
}

.comments__title {
  margin: 0 0 0.5rem;
  font-size: var(--pixel-font-size-xs);
  font-weight: normal;
  color: var(--pixel-text-muted);
}

.replying {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0 0 0.45rem;
  font-size: var(--pixel-font-size-xs);
  color: var(--pixel-text-muted);
}

.replying__cancel {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.composer {
  display: flex;
  align-items: flex-end;
  gap: 0.45rem;
}

.composer__input {
  flex: 1;
  min-width: 0;
  resize: vertical;
  font-family: inherit;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.5;
  padding: 0.45rem;
  color: var(--pixel-text);
  background: var(--pixel-bg);
}

.comments__empty,
.comments__error {
  margin: 0.65rem 0 0;
  font-size: var(--pixel-font-size-xs);
}

.comments__error {
  color: var(--pixel-danger);
}

.thread,
.replies {
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
}

.thread__item + .thread__item {
  margin-top: 0.65rem;
}

.comment {
  padding: 0.1rem 0 0.1rem 0.65rem;
  border-left: 1px solid var(--pixel-border);
}

.replies {
  margin: 0.45rem 0 0 0.75rem;
}

.replies li + li {
  margin-top: 0.45rem;
}

.comment__meta {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: var(--pixel-font-size-xs);
  color: var(--pixel-text-muted);
}

.comment__body {
  margin: 0.25rem 0 0.35rem;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.5;
}

.comment__mention {
  color: var(--pixel-accent);
}

.comment__mention::before {
  content: '@';
}

.comment__actions {
  display: flex;
  gap: 0.3rem;
}

.comment__actions :deep(.icon-btn) {
  height: 1.7rem;
  min-width: 1.7rem;
  box-shadow: none;
}
</style>
