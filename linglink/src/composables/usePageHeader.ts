import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'

export interface PageHeaderMetrics {
  views: number
  likes: number
  edits: number
  comments: number
}

export const pageHeaderTitle = ref<string | null>(null)
export const pageHeaderMetrics = shallowRef<PageHeaderMetrics | null>(null)
export const pageHeaderBack = shallowRef<(() => void) | null>(null)

let headerOwner = 0

/** Replaces the shell title while this view is the latest one to claim it. */
export function usePageHeader(
  source: () => { title: string | null; metrics: PageHeaderMetrics | null; onBack?: (() => void) | null },
) {
  const token = ++headerOwner
  watch(
    source,
    (value) => {
      if (token !== headerOwner) return
      pageHeaderTitle.value = value.title
      pageHeaderMetrics.value = value.metrics
      pageHeaderBack.value = value.onBack ?? null
    },
    { immediate: true },
  )
  onBeforeUnmount(() => {
    if (token === headerOwner) {
      pageHeaderTitle.value = null
      pageHeaderMetrics.value = null
      pageHeaderBack.value = null
    }
  })
}
