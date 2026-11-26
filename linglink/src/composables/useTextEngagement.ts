import { computed, ref, watch, type Ref } from 'vue'

import { useRepositories } from '@/composables/useRepositories'
import { publicStatsOf } from '@/domain/text/publicStats'
import type { LearningText } from '@/types/db'

type Bucket = {
  views: Ref<number>
  likes: Ref<number>
  comments: Ref<number>
  edits: Ref<number>
}

const buckets = new Map<string, Bucket>()

function bucket(textId: string): Bucket {
  let stored = buckets.get(textId)
  if (!stored) {
    stored = {
      views: ref(0),
      likes: ref(0),
      comments: ref(0),
      edits: ref(0),
    }
    buckets.set(textId, stored)
  }
  return stored
}

export function applyTextEngagement(text: LearningText): void {
  const stats = publicStatsOf(text)
  const stored = bucket(text.id)
  stored.views.value = stats.views
  stored.likes.value = stats.likes
  stored.comments.value = stats.comments
  stored.edits.value = stats.edits
}

export function setTextCommentCount(textId: string, count: number): void {
  bucket(textId).comments.value = count
}

export function useTextEngagement(source: () => LearningText | null | undefined) {
  const repos = useRepositories()
  const textId = computed(() => source()?.id ?? '')

  watch(
    textId,
    (id) => {
      const text = source()
      if (!id || !text) return
      applyTextEngagement(text)
      void repos.texts
        .syncPublicStats(id)
        .then((live) => {
          if (!live || source()?.id !== id) return
          applyTextEngagement(live)
        })
        .catch(() => {
          /* Stats stay on the text document if subcollections are not readable. */
        })
    },
    { immediate: true },
  )

  const views = computed(() => (textId.value ? bucket(textId.value).views.value : 0))
  const likes = computed(() => (textId.value ? bucket(textId.value).likes.value : 0))
  const comments = computed(() => (textId.value ? bucket(textId.value).comments.value : 0))
  const edits = computed(() => (textId.value ? bucket(textId.value).edits.value : 0))

  return { views, likes, comments, edits }
}
