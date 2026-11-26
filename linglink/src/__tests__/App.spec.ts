// @vitest-environment node
import { describe, it, expect } from 'vitest'

import { createRepositories, resetRepositoriesForTests } from '@/services/createRepositories'

describe('App bootstrap', () => {
  it('provides mock repositories', async () => {
    resetRepositoriesForTests()
    const repos = createRepositories('mock')
    const texts = await repos.texts.listPublished()
    expect(texts.length).toBeGreaterThan(0)
  })
})
