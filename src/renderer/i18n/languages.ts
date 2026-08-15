import type { LanguageVarious } from '@shared/data/preference/preferenceTypes'
import { languageNativeNameMap } from '@shared/utils/languages'

/** Display order of the app's language picker. Labels come from the shared native-name map. */
const APP_LANGUAGE_FLAGS: ReadonlyArray<{ value: LanguageVarious; flag: string }> = [
  { value: 'zh-CN', flag: '🇨🇳' },
  { value: 'en-US', flag: '🇺🇸' }
]

export const appLanguageOptions: ReadonlyArray<{
  value: LanguageVarious
  label: string
  flag: string
}> = APP_LANGUAGE_FLAGS.map(({ value, flag }) => ({ value, flag, label: languageNativeNameMap[value] }))

export function isAppLanguage(value: string | null | undefined): value is LanguageVarious {
  return appLanguageOptions.some((option) => option.value === value)
}
