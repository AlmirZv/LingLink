import { inject } from 'vue'

import { REPOSITORIES_KEY } from '@/services/injection'
import type { Repositories } from '@/services/repositories/contracts'

export function useRepositories(): Repositories {
  const repos = inject(REPOSITORIES_KEY)
  if (!repos) {
    throw new Error('Repositories were not provided. Call createRepositories() in main.ts.')
  }
  return repos
}
