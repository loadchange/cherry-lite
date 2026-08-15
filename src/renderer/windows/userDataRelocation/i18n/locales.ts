export const relocationLocales = {
  en: {
    translation: {
      relocation: {
        title: 'Data Directory Migration',
        preparing: 'Preparing migration...',
        copying: 'Copying data...',
        committing: 'Saving new data directory...',
        completed: {
          title: 'Migration complete',
          description: 'Restart Cherry Studio to use the new data directory.'
        },
        failed: {
          title: 'Migration failed',
          description: 'Cherry Studio will keep using the previous data directory.'
        },
        restart_success: 'Restart Cherry Studio',
        restart_failure: 'Continue with Previous Directory',
        from: 'Current directory',
        to: 'New directory'
      }
    }
  },
  'zh-CN': {
    translation: {
      relocation: {
        title: '数据目录迁移',
        preparing: '正在准备迁移...',
        copying: '正在复制数据...',
        committing: '正在保存新的数据目录...',
        completed: {
          title: '迁移完成',
          description: '请重启 Cherry Studio 以使用新的数据目录。'
        },
        failed: {
          title: '迁移失败',
          description: 'Cherry Studio 将继续使用原数据目录。'
        },
        restart_success: '重启 Cherry Studio',
        restart_failure: '继续使用原数据目录',
        from: '当前目录',
        to: '新目录'
      }
    }
  }
}
