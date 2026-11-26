import { describe, expect, it } from 'vitest'

import { classifyPietherPayload, formsFromDictionaryEntry } from '@/services/dictionary/pietherDictionary'

describe('formsFromDictionaryEntry', () => {
  it('keeps the text surface and every translation', () => {
    const forms = formsFromDictionaryEntry(
      {
        word: '狗',
        translations: {
          en: ['dog'],
          ja: ['犬'],
          ru: ['собака'],
          zh: ['狗'],
        },
      },
      'собака',
      'ru',
    )
    expect(forms.get('ru')).toEqual(['собака'])
    expect(forms.get('ja')).toEqual(['犬'])
    expect(forms.get('en')).toEqual(['dog'])
  })

  it('keeps dictionary stress as a combining acute on the letter', () => {
    const forms = formsFromDictionaryEntry(
      {
        word: 'я',
        translations: { ru: ["я'"], ja: ['私'] },
      },
      'я',
      'ru',
    )
    expect(forms.get('ru')).toEqual(['я\u0301'])
  })

  it('adds the searched surface when the dictionary uses another language as the headword', () => {
    const forms = formsFromDictionaryEntry(
      {
        word: '你好',
        translations: { en: ['hello'], zh: ['你好'], ja: ['こんにちは'] },
      },
      'hello',
      'en',
    )
    expect(forms.get('en')).toEqual(['hello'])
    expect(forms.get('zh')).toContain('你好')
  })
})

describe('classifyPietherPayload', () => {
  it('treats an empty translation map as a confirmed miss', () => {
    expect(classifyPietherPayload({ word: 'иду', translations: {} }, 'иду')).toEqual({ status: 'missing' })
  })

  it('keeps a payload that has at least one translation', () => {
    expect(classifyPietherPayload({ word: '狗', translations: { en: ['dog'] } }, 'собака').status).toBe('found')
  })
})