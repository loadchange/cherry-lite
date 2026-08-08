import type { Tab } from '@renderer/hooks/tab'
import { Globe, Languages, MessageCircle, Rocket, ScanSearch, Settings } from 'lucide-react'

export type IconComponent = React.FC<{ size?: number; strokeWidth?: number; className?: string }>

// ─── Route → Icon mapping ─────────────────────────────────────────────────────

export const ROUTE_ICONS: Record<string, IconComponent> = {
  '/app/chat': MessageCircle,
  '/app/translate': Languages,
  '/app/launchpad': Rocket,
  '/app/file-preview': ScanSearch,
  '/settings': Settings
}

export function getTabIcon(tab: Tab): IconComponent {
  if (tab.type === 'webview') return Globe
  const pathname = new URL(tab.url, 'https://www.cherry-ai.com/').pathname
  const segments = pathname.split('/').filter(Boolean)
  const key = segments[0] === 'app' && segments.length >= 2 ? '/app/' + segments[1] : '/' + (segments[0] || '')
  return ROUTE_ICONS[key] || MessageCircle
}
