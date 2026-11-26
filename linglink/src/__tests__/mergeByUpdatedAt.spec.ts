import { describe, expect, it } from 'vitest'

import { mergeById, pickNewer } from '@/services/local/mergeByUpdatedAt'

describe('mergeByUpdatedAt', () => {
  it('keeps the later local write when syncing with the server', () => {
    const merged = mergeById(
      [{ id: 'a', updatedAt: '2026-11-16T12:00:00.000Z', level: 1 }],
      [{ id: 'a', updatedAt: '2026-11-16T10:00:00.000Z', level: 0 }],
      (row) => row.id,
      pickNewer,
    )
    expect(merged[0]?.level).toBe(1)
  })
})
