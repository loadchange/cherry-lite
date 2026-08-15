import type { LanguageVarious } from '@shared/data/preference/preferenceTypes'

export const languageEnglishNameMap: Record<LanguageVarious, string> = {
  'en-US': 'English',
  'zh-CN': 'Chinese (Simplified)'
}

/** Native-script display name for each language — mirrors the labels in AppearanceSettings' language picker. */
export const languageNativeNameMap: Record<LanguageVarious, string> = {
  'zh-CN': '中文',
  'en-US': 'English'
}

export const defaultLanguage = 'en-US'

/**
 * Coerce any persisted or system locale to a supported app language: `zh-*`
 * maps to zh-CN, everything else — including locales like ja-JP saved by
 * versions that shipped more UI languages — falls back to English.
 */
export function coerceAppLanguage(value: string | null | undefined): LanguageVarious {
  if (value === 'zh-CN' || value === 'en-US') return value
  if (value?.toLowerCase().startsWith('zh')) return 'zh-CN'
  return defaultLanguage
}
