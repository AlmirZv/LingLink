import type { Repositories } from '@/services/repositories/contracts'
import type { ID, LearningText, TextSeries } from '@/types/db'

const ts = () => new Date().toISOString()

function newSeriesId(): ID {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid ? `series-${uuid}` : `series-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function stripSeries(text: LearningText): LearningText {
  const next: LearningText = { ...text, updatedAt: ts() }
  delete next.seriesId
  delete next.seriesPosition
  return next
}

async function listAuthorSeries(repos: Repositories, authorId: ID): Promise<TextSeries[]> {
  try {
    return await repos.series.listByAuthor(authorId)
  } catch {
    try {
      return (await repos.series.list()).filter((item) => item.authorId === authorId)
    } catch {
      return []
    }
  }
}

async function reindexSeriesTexts(repos: Repositories, series: TextSeries): Promise<void> {
  await Promise.all(
    series.textIds.map(async (textId, index) => {
      const text = await repos.texts.getById(textId).catch(() => null)
      if (!text || text.seriesId !== series.id) return
      if (text.seriesPosition === index) return
      await repos.texts.update({ ...text, seriesId: series.id, seriesPosition: index, updatedAt: ts() })
    }),
  )
}

async function removeTextIdFromSeries(repos: Repositories, seriesId: ID, textId: ID): Promise<void> {
  const series = await repos.series.getById(seriesId)
  if (!series) return
  const textIds = series.textIds.filter((id) => id !== textId)
  if (textIds.length === series.textIds.length) return
  const next: TextSeries = { ...series, textIds, updatedAt: ts() }
  await repos.series.update(next)
  await reindexSeriesTexts(repos, next)
}

export async function createUserSeries(
  repos: Repositories,
  authorId: ID,
  title: string,
): Promise<TextSeries> {
  const name = title.trim()
  if (!name) throw new Error('Series title is required')
  const existing = await listAuthorSeries(repos, authorId)
  const match = existing.find((item) => item.title.toLocaleLowerCase() === name.toLocaleLowerCase())
  if (match) return match
  const now = ts()
  return repos.series.create({
    id: newSeriesId(),
    title: name,
    authorId,
    textIds: [],
    createdAt: now,
    updatedAt: now,
  })
}

export async function renameUserSeries(
  repos: Repositories,
  seriesId: ID,
  authorId: ID,
  title: string,
): Promise<TextSeries | null> {
  const name = title.trim()
  const series = await repos.series.getById(seriesId)
  if (!series || series.authorId !== authorId || !name) return series
  if (series.title === name) return series
  return repos.series.update({
    ...series,
    title: name,
    updatedAt: ts(),
  })
}

export async function deleteUserSeries(repos: Repositories, seriesId: ID, authorId: ID): Promise<void> {
  const series = await repos.series.getById(seriesId)
  if (!series || series.authorId !== authorId) return
  for (const textId of series.textIds) {
    const text = await repos.texts.getById(textId).catch(() => null)
    if (!text || text.seriesId !== seriesId) continue
    await repos.texts.update(stripSeries(text)).catch(() => undefined)
  }
  await repos.series.remove(seriesId)
}

export async function attachTextToSeries(
  repos: Repositories,
  text: LearningText,
  seriesId: ID | undefined,
): Promise<LearningText> {
  return setTextSeries(repos, text, seriesId)
}

export async function setTextSeries(
  repos: Repositories,
  text: LearningText,
  seriesId: ID | undefined,
): Promise<LearningText> {
  const wanted = seriesId?.trim() || undefined
  const previous = text.seriesId

  if (previous && previous !== wanted) {
    await removeTextIdFromSeries(repos, previous, text.id)
  }

  if (!wanted) {
    if (!previous && text.seriesPosition === undefined) return text
    return repos.texts.update(stripSeries(text))
  }

  const series = await repos.series.getById(wanted)
  if (!series || series.authorId !== text.authorId) {
    if (!previous) return text
    return repos.texts.update(stripSeries(text))
  }

  if (series.textIds.includes(text.id)) {
    const position = series.textIds.indexOf(text.id)
    if (text.seriesId === wanted && text.seriesPosition === position) return text
    return repos.texts.update({ ...text, seriesId: wanted, seriesPosition: position, updatedAt: ts() })
  }

  const nextSeries: TextSeries = {
    ...series,
    textIds: [...series.textIds, text.id],
    updatedAt: ts(),
  }
  await repos.series.update(nextSeries)
  return repos.texts.update({
    ...text,
    seriesId: wanted,
    seriesPosition: nextSeries.textIds.length - 1,
    updatedAt: ts(),
  })
}
