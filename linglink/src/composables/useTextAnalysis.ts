import { ref, shallowRef } from 'vue'

import { analyzeText } from '@/domain/text/textAnalysisService'
import { createAnalysisWordLookup } from '@/services/analysisWordLookup'
import { useRepositories } from '@/composables/useRepositories'
import type { TextAnalysisResult } from '@/types/analysis'
import type { LanguageCode } from '@/types/db'

export function useTextAnalysis() {
  const repos = useRepositories()
  const lookup = createAnalysisWordLookup(repos)

  const result = shallowRef<TextAnalysisResult | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function runAnalysis(text: string, language: LanguageCode) {
    loading.value = true
    error.value = null
    try {
      result.value = await analyzeText({ text, language }, lookup)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Analysis failed'
      result.value = null
    } finally {
      loading.value = false
    }
  }

  function clear() {
    result.value = null
    error.value = null
  }

  return {
    result,
    loading,
    error,
    runAnalysis,
    clear,
  }
}
