import TtsSettingsPage from '@renderer/pages/settings/TtsSettings/TtsSettingsPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/tts')({ component: TtsSettingsPage })
