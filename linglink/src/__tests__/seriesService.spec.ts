// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEMO_USER_ID } from '@/services/mock/constants'
import { createRepositories, resetRepositoriesForTests } from '@/services/createRepositories'
import { createUserSeries, setTextSeries } from '@/services/seriesService'

function stubStorage() {
  const store: Record<string, string> = {}
  vi.stubGlobal('localStorage', {
    getItem(key: string) {
      return store[key] ?? null
    },
    setItem(key: string, value: string) {
      store[key] = value
    },
    removeItem(key: string) {
      delete store[key]
    },
    clear() {
      for (const key of Object.keys(store)) delete store[key]
    },
  })
  resetRepositoriesForTests()
}

describe('seriesService', () => {
  beforeEach(stubStorage)

  it('writes a new series and links a text to it', async () => {
    const repos = createRepositories('mock')
    const created = await createUserSeries(repos, DEMO_USER_ID, '  Лето  ')
    expect(created.title).toBe('Лето')
    expect(await repos.series.getById(created.id)).toEqual(created)

    const again = await createUserSeries(repos, DEMO_USER_ID, 'лето')
    expect(again.id).toBe(created.id)

    const text = (await repos.texts.listPublished()).find((item) => item.authorId === DEMO_USER_ID)
    expect(text).toBeTruthy()
    const linked = await setTextSeries(repos, text!, created.id)
    expect(linked.seriesId).toBe(created.id)
    expect(linked.seriesPosition).toBe(0)
    expect((await repos.series.getById(created.id))?.textIds).toEqual([text!.id])
  })

  it('moves a text between series and can detach it', async () => {
    const repos = createRepositories('mock')
    const first = await createUserSeries(repos, DEMO_USER_ID, 'A')
    const second = await createUserSeries(repos, DEMO_USER_ID, 'B')
    const text = (await repos.texts.listPublished()).find((item) => item.authorId === DEMO_USER_ID)!

    await setTextSeries(repos, text, first.id)
    const moved = await setTextSeries(repos, (await repos.texts.getById(text.id))!, second.id)
    expect(moved.seriesId).toBe(second.id)
    expect((await repos.series.getById(first.id))?.textIds).toEqual([])
    expect((await repos.series.getById(second.id))?.textIds).toEqual([text.id])

    const detached = await setTextSeries(repos, moved, undefined)
    expect(detached.seriesId).toBeUndefined()
    expect((await repos.series.getById(second.id))?.textIds).toEqual([])
  })
})
