import type { SidebarAppId } from '@renderer/utils/sidebar'
import type { LucideIcon } from 'lucide-react'
import { Languages, MessageSquare } from 'lucide-react'

/**
 * Icon component for each built-in sidebar app. Keyed by the `SidebarAppId` union so the
 * compiler enforces full coverage — adding a new sidebar app id without an icon
 * here is a type error. Kept in the component layer because the values are React
 * components; the navigation data and logic live in `@renderer/utils/sidebar`.
 */
export const SIDEBAR_ICON_COMPONENTS: Record<SidebarAppId, LucideIcon> = {
  assistants: MessageSquare,
  translate: Languages
}
