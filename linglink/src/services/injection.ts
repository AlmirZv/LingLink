import type { InjectionKey } from 'vue'

import type { Repositories } from '@/services/repositories/contracts'

export const REPOSITORIES_KEY: InjectionKey<Repositories> = Symbol('linglink.repositories')
