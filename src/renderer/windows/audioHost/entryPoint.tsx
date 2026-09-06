import '@renderer/assets/styles/tailwind.css'

import { prepareWindow } from '@renderer/windows/prepareWindow'
import { createRoot } from 'react-dom/client'

import AudioHostApp from './AudioHostApp'

await prepareWindow({ preference: ['app.language', 'ui.theme_mode', 'ui.theme_user.color_primary'] })

createRoot(document.getElementById('root') as HTMLElement).render(<AudioHostApp />)
