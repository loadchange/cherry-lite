import { MenuDivider, MenuItem, MenuList, PageHeader, RowFlex } from '@cherrystudio/ui'
import Scrollbar from '@renderer/components/Scrollbar'
import { SettingsContentColumn } from '@renderer/components/SettingsPrimitives'
import { useTheme } from '@renderer/hooks/useTheme'
import ImportMenuOptions from '@renderer/pages/settings/DataSettings/ImportMenuSettings'
import {
  settingsSubmenuDividerClassName,
  settingsSubmenuItemClassName,
  settingsSubmenuItemLabelClassName,
  settingsSubmenuListClassName,
  settingsSubmenuScrollClassName,
  settingsSubmenuSectionTitleClassName
} from '@renderer/pages/settings/settingsStyles'
import { FolderCog, Import } from 'lucide-react'
import type { FC } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import BasicDataSettings from './BasicDataSettings'
import LocalBackupSettings from './LocalBackupSettings'

const DataSettings: FC = () => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [menu, setMenu] = useState<string>('data')

  const menuItems = [
    { key: 'data', title: t('settings.data.data.title'), icon: <FolderCog size={16} /> },
    { key: 'divider_1', isDivider: true, text: t('settings.data.divider.backup_settings') },
    { key: 'local_backup', title: t('settings.data.local.title'), icon: <FolderCog size={16} /> },
    { key: 'divider_2', isDivider: true, text: t('settings.data.divider.import_settings') },
    {
      key: 'import_settings',
      title: t('settings.data.import_settings.title'),
      icon: <Import size={16} />
    }
  ]

  return (
    <RowFlex className="flex-1">
      <div
        className={`flex flex-col ${settingsSubmenuScrollClassName} [&_.iconfont]:text-current [&_.iconfont]:leading-4`}>
        <PageHeader title={t('settings.data.title')} />
        <Scrollbar className="min-h-0 flex-1">
          <MenuList className={settingsSubmenuListClassName}>
            {menuItems.map((item, index) =>
              item.isDivider ? (
                <div key={item.key}>
                  {index > 0 && <MenuDivider className={settingsSubmenuDividerClassName} />}
                  <div className={settingsSubmenuSectionTitleClassName}>{item.text || ''}</div>
                </div>
              ) : (
                <MenuItem
                  key={item.key}
                  label={item.title || ''}
                  active={menu === item.key}
                  onClick={() => setMenu(item.key)}
                  icon={item.icon}
                  className={settingsSubmenuItemClassName}
                  labelClassName={settingsSubmenuItemLabelClassName}
                />
              )
            )}
          </MenuList>
        </Scrollbar>
      </div>
      <SettingsContentColumn theme={theme}>
        {menu === 'data' && <BasicDataSettings />}
        {menu === 'import_settings' && <ImportMenuOptions />}
        {menu === 'local_backup' && <LocalBackupSettings />}
      </SettingsContentColumn>
    </RowFlex>
  )
}

export default DataSettings
