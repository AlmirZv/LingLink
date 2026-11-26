// @vitest-environment node
import { describe, it, expect } from 'vitest'

import {
  CONTENT_LANGUAGE_OPTIONS,
  foldSurface,
  isSupportedUiLocale,
  MVP_LANGUAGE_OPTIONS,
  normalizeWordStress,
  textDirection,
} from '@/constants/languages'

describe('languages', () => {
  it('offers every learning language as an interface language', () => {
    expect(MVP_LANGUAGE_OPTIONS.map((language) => language.code)).toEqual(
      CONTENT_LANGUAGE_OPTIONS.map((language) => language.code),
    )
  })

  it('lists the multilingual dictionary languages for texts', () => {
    expect(CONTENT_LANGUAGE_OPTIONS.map((language) => language.code)).toEqual([
      'zh',
      'en',
      'fr',
      'de',
      'es',
      'pt',
      'it',
      'ru',
      'ar',
      'ja',
      'ko',
    ])
  })

  it('turns dictionary stress marks into combining acutes', () => {
    expect(normalizeWordStress("я'")).toBe('я\u0301')
    expect(normalizeWordStress('в направле́нии')).toBe('в направле́нии')
    expect(normalizeWordStress("в направле'нии")).toBe('в направле́нии')
    expect(foldSurface("Магазин'", 'ru')).toBe('магазин')
    expect(foldSurface('в направле́нии', 'ru')).toBe('в направлении')
  })

  it('marks Arabic as right-to-left', () => {
    expect(textDirection('ar')).toBe('rtl')
    expect(textDirection('zh')).toBe('ltr')
    expect(textDirection('ko')).toBe('ltr')
  })

  it('validates UI locale codes', () => {
    expect(isSupportedUiLocale('ru')).toBe(true)
    expect(isSupportedUiLocale('de')).toBe(true)
    expect(isSupportedUiLocale('ko')).toBe(true)
    expect(isSupportedUiLocale('xx')).toBe(false)
  })
})
