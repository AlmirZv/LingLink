import { computed } from 'vue'

import { isSupportedUiLocale } from '@/constants/languages'
import { translationTargetLanguage } from '@/domain/learning/readingLanguageModel'
import { useSessionStore } from '@/stores/session'
import type { LanguageCode } from '@/types/db'

export function useLanguageContext() {
  const session = useSessionStore()

  const knownLanguage = computed((): LanguageCode => {
    const ui = session.interfaceLanguage
    if (ui && isSupportedUiLocale(ui)) return ui
    return 'ru'
  })

  const learningLanguage = computed(
    (): LanguageCode => session.activeLearningLanguage ?? 'ja',
  )

  function translationTargetForText(textLanguage: LanguageCode): LanguageCode {
    return translationTargetLanguage(
      textLanguage,
      knownLanguage.value,
      learningLanguage.value,
    )
  }

  return {
    knownLanguage,
    learningLanguage,
    translationTargetForText,
  }
}
