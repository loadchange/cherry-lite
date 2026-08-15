import 'dayjs/locale/zh-cn'

import { preferenceService } from '@data/PreferenceService'
import { loggerService } from '@logger'
import type { LanguageVarious } from '@shared/data/preference/preferenceTypes'
import { coerceAppLanguage, defaultLanguage } from '@shared/utils/languages'
import dayjs from 'dayjs'
import i18n from 'i18next'
import resourcesToBackend from 'i18next-resources-to-backend'
import { initReactI18next } from 'react-i18next'

const logger = loggerService.withContext('I18N')

// Lazy locale-pack loaders. Each dynamic import() is emitted as its own async
// chunk, so a window entry bundles zero translation JSON up front — i18next pulls
// the current language (and the en-US fallback) on demand inside initI18n().
const localeLoaders = {
  'en-US': () => import('./locales/en-us.json'),
  'zh-CN': () => import('./locales/zh-cn.json')
} satisfies Record<LanguageVarious, () => Promise<unknown>>

export const getLanguage = async (): Promise<LanguageVarious> => {
  const saved = await preferenceService.get('app.language')
  return coerceAppLanguage(saved ?? navigator.language)
}

export const getLanguageCode = async () => {
  return (await getLanguage()).split('-')[0]
}

// Map i18n language codes to dayjs locale codes
const dayjsLocaleMap: Record<string, string> = {
  'en-US': 'en',
  'zh-CN': 'zh-cn'
}

export const setDayjsLocale = (language: string) => {
  const dayjsLocale = dayjsLocaleMap[language] || 'en'
  dayjs.locale(dayjsLocale)
}

let initPromise: Promise<void> | null = null

const doInit = async (): Promise<void> => {
  // Resolve the language up front. A rejected lookup falls back rather than
  // rejecting init — the UI must still render (in the fallback language).
  const lng = await getLanguage().catch(() => defaultLanguage)

  await i18n
    .use(
      resourcesToBackend((language: string) => {
        const loader = localeLoaders[language as LanguageVarious]
        return loader ? loader() : Promise.reject(new Error(`No locale pack for "${language}"`))
      })
    )
    .use(initReactI18next)
    .init({
      lng,
      fallbackLng: defaultLanguage,
      // Load only the exact locale code (e.g. `zh-CN`), never the bare base
      // (`zh`), which has no pack and would trigger a doomed extra fetch.
      load: 'currentOnly',
      // Drop i18next's internal setTimeout(0) so init settles without a
      // macrotask (keeps fake-timer tests deterministic). Renamed `initAsync`
      // in i18next v24, and the compat alias is removed in v26 — rename when
      // upgrading.
      initImmediate: false,
      interpolation: {
        escapeValue: false
      },
      saveMissing: true,
      missingKeyHandler: (_1, _2, key) => {
        logger.error(`Missing key: ${key}`)
      }
    })
}

/**
 * Initialize i18next once, lazily. Idempotent: concurrent and repeat callers all
 * await the same in-flight promise. Every window entry must `await initI18n()`
 * before rendering, because translation packs now load asynchronously.
 */
export const initI18n = (): Promise<void> => (initPromise ??= doInit())

export default i18n
