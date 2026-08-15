import { application } from '@application'
import type { LanguageVarious } from '@shared/data/preference/preferenceTypes'
import { coerceAppLanguage, defaultLanguage } from '@shared/utils/languages'
import { app } from 'electron'

// Main process owns an independent, statically-imported locale catalog (this
// directory), mirroring the renderer's locales/ split. It carries only the keys
// main actually renders — app menu, tray, dialogs, context menu, the OAuth
// callback page and a few shared strings.
import EnUs from './locales/en-us.json'
import ZhCn from './locales/zh-cn.json'

const locales = Object.fromEntries(
  [
    ['en-US', EnUs],
    ['zh-CN', ZhCn]
  ].map(([locale, translation]) => [locale, { translation }])
)

/** Every language main carries a catalog for — the source of truth other modules should key off of. */
export const SUPPORTED_LANGUAGES = Object.keys(locales) as LanguageVarious[]

export const getAppLanguage = (): LanguageVarious => {
  const language = application.get('PreferenceService').get('app.language')
  if (language) return coerceAppLanguage(language)
  return coerceAppLanguage(app.getLocale())
}

export const getI18n = (language: LanguageVarious = getAppLanguage()): Record<string, any> => {
  return locales[language]
}

/**
 * Get translation by key path (e.g., 'dialog.save_file')
 * This is a simplified version for main process, similar to i18next's t() function.
 *
 * Resolution order: `language` (defaults to the current app language), then the
 * en-US catalog, then the key itself. Supports i18next-style `{{var}}`
 * interpolation: pass `params` and any `{{name}}` placeholder in the resolved
 * string is replaced with `params.name`. Placeholders without a matching param
 * are left intact.
 *
 * The optional `language` override lets a caller resolve a string in a language
 * other than the app's current one — e.g. the API gateway's OpenAPI docs render
 * one translation per requested language, independent of `app.language`.
 */
export const t = (key: string, params?: Record<string, string | number>, language?: LanguageVarious): string => {
  const resolve = (translation: any): string | undefined => {
    let result: any = translation
    for (const k of key.split('.')) {
      result = result?.[k]
      if (result === undefined) {
        return undefined
      }
    }
    return typeof result === 'string' ? result : undefined
  }

  const value = resolve(getI18n(language).translation) ?? resolve(locales[defaultLanguage].translation)
  if (value === undefined) {
    return key
  }
  if (!params) {
    return value
  }
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (match: string, name: string) =>
    name in params ? String(params[name]) : match
  )
}
