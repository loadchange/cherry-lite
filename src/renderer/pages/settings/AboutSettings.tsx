import { Badge, Button, CircularProgress, Divider, Scrollbar, Switch } from '@cherrystudio/ui'
import { usePreference } from '@data/hooks/usePreference'
import AppLogo from '@renderer/assets/images/logo.png'
import LogoAvatar from '@renderer/components/icons/LogoAvatar'
import IndicatorLight from '@renderer/components/IndicatorLight'
import { ReleaseNotes } from '@renderer/components/ReleaseNotes'
import {
  SettingGroup,
  SettingRow,
  SettingRowTitle,
  SettingsContentColumn,
  SettingTitle
} from '@renderer/components/SettingsPrimitives'
import UpdateDialogPopup from '@renderer/components/UpdateDialogPopup'
import { useAppUpdateState } from '@renderer/hooks/useAppUpdateState'
import { useTheme } from '@renderer/hooks/useTheme'
import { ipcApi } from '@renderer/ipc'
import { toast } from '@renderer/services/toast'
import { cn } from '@renderer/utils/style'
import { APP_NAME } from '@shared/utils/constants'
import { debounce } from 'es-toolkit/compat'
import { Github } from 'lucide-react'
import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const AboutSettings: FC = () => {
  const [autoCheckUpdate, setAutoCheckUpdate] = usePreference('app.dist.auto_update.enabled')

  const [version, setVersion] = useState('')
  const [isPortable, setIsPortable] = useState(false)
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { appUpdateState, updateAppUpdateState } = useAppUpdateState()

  const onCheckUpdate = debounce(
    async () => {
      if (appUpdateState.checking || appUpdateState.downloading) {
        return
      }

      if (appUpdateState.downloaded) {
        void UpdateDialogPopup.show({ releaseInfo: appUpdateState.info || null })
        return
      }

      updateAppUpdateState({ checking: true, manualCheck: true })

      try {
        await ipcApi.request('app.updater.check_for_update')
      } catch {
        updateAppUpdateState({ manualCheck: false })
        toast.error(t('settings.about.updateError'))
      }

      updateAppUpdateState({ checking: false })
    },
    2000,
    { leading: true, trailing: false }
  )

  const onOpenWebsite = (url: string) => {
    void ipcApi.request('system.shell.open_website', url)
  }

  useEffect(() => {
    void (async () => {
      const appInfo = await ipcApi.request('app.get_info')
      setVersion(appInfo.version)
      setIsPortable(appInfo.isPortable)
    })()
  }, [])

  const isUpdateReady = appUpdateState.available && appUpdateState.downloaded && !appUpdateState.downloading
  const releaseNotesText =
    typeof appUpdateState.info?.releaseNotes === 'string'
      ? appUpdateState.info.releaseNotes.replace(/\n/g, '\n\n')
      : (appUpdateState.info?.releaseNotes?.map((note) => note.note).join('\n') ?? '')

  return (
    <SettingsContentColumn theme={theme}>
      <SettingGroup theme={theme}>
        <SettingTitle className="gap-2">
          <span className="font-semibold text-[15px]">{t('settings.about.title')}</span>
          <button
            type="button"
            aria-label={t('settings.about.repository')}
            onClick={() => onOpenWebsite('https://github.com/loadchange/cherry-studio-lite')}
            className="inline-flex items-center justify-center rounded-md p-1 text-foreground transition-colors hover:bg-muted">
            <Github className="size-5" />
          </button>
        </SettingTitle>

        <Divider className="my-1.5" />

        <div className="flex flex-wrap items-center justify-between gap-3 py-1">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              aria-label={APP_NAME}
              onClick={() => onOpenWebsite('https://github.com/loadchange/cherry-studio-lite')}
              className="relative cursor-pointer">
              {appUpdateState.downloading && appUpdateState.downloadProgress > 0 && (
                <div className="-top-0.5 -left-0.5 pointer-events-none absolute">
                  <CircularProgress
                    value={appUpdateState.downloadProgress}
                    size={76}
                    strokeWidth={4}
                    shape="square"
                    className="stroke-transparent"
                    progressClassName="stroke-[#67ad5b]"
                  />
                </div>
              )}
              <LogoAvatar logo={AppLogo} size={72} className="rounded-full" />
            </button>

            <div className="flex min-h-18 flex-col items-start justify-center">
              <div className="mb-1 font-bold text-foreground text-lg">{APP_NAME}</div>
              <div className="text-muted-foreground text-sm">{t('settings.about.description')}</div>
              <button
                type="button"
                aria-label={t('settings.about.releases.title')}
                onClick={() => onOpenWebsite('https://github.com/loadchange/cherry-studio-lite/releases')}
                className="mt-1.5">
                <Badge className="cursor-pointer rounded-md border-primary/20 bg-primary/10 px-1.5 py-0 text-[11px] text-primary leading-4 transition-colors hover:bg-primary/15">
                  v{version}
                </Badge>
              </button>
            </div>
          </div>

          {!isPortable && (
            <div className="flex shrink-0 items-center justify-end">
              <Button
                size="sm"
                variant={isUpdateReady ? 'default' : 'outline'}
                loading={appUpdateState.checking}
                onClick={onCheckUpdate}
                disabled={appUpdateState.downloading}
                className={cn(
                  'w-fit! min-w-0! shrink-0',
                  isUpdateReady &&
                    'bg-success text-primary-foreground hover:bg-success/90 dark:bg-success dark:text-primary-foreground dark:hover:bg-success/90'
                )}>
                {appUpdateState.downloading
                  ? t('settings.about.downloading')
                  : appUpdateState.available
                    ? t('settings.about.checkUpdate.available')
                    : t('settings.about.checkUpdate.label')}
              </Button>
            </div>
          )}
        </div>

        {!isPortable && (
          <>
            <Divider className="my-3" />
            <SettingRow className="gap-3">
              <SettingRowTitle>{t('settings.general.auto_check_update.title')}</SettingRowTitle>
              <Switch checked={autoCheckUpdate} onCheckedChange={(v) => setAutoCheckUpdate(v)} />
            </SettingRow>
          </>
        )}
      </SettingGroup>

      {appUpdateState.info && appUpdateState.available && (
        <SettingGroup theme={theme}>
          <SettingRow className="gap-3">
            <SettingRowTitle className="gap-2.5">
              {t('settings.about.updateAvailable', { version: appUpdateState.info.version })}
              <IndicatorLight color="var(--success)" />
            </SettingRowTitle>
          </SettingRow>
          <Divider className="my-3" />
          <Scrollbar className="max-h-96 overflow-x-hidden pr-2">
            <ReleaseNotes content={releaseNotesText} />
          </Scrollbar>
        </SettingGroup>
      )}
    </SettingsContentColumn>
  )
}

export default AboutSettings
