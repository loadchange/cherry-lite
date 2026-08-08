import type { Tab } from '@renderer/hooks/tab'
import { Globe, Languages, MessageCircle, Rocket, ScanSearch, Settings } from 'lucide-react'
import { describe, expect, it } from 'vitest'

import { getTabIcon } from '../tabIcons'

function routeTab(url: string): Tab {
  return {
    id: url,
    type: 'route',
    url,
    title: url
  }
}

function webviewTab(url: string): Tab {
  return {
    id: url,
    type: 'webview',
    url,
    title: url
  }
}

describe('getTabIcon', () => {
  it.each([
    ['/app/chat', MessageCircle],
    ['/app/translate', Languages],
    ['/app/file-preview?path=%2Ftmp%2Freport.pdf', ScanSearch],
    ['/app/launchpad', Rocket],
    ['/settings/provider', Settings]
  ])('returns the shared app icon for %s', (url, Icon) => {
    expect(getTabIcon(routeTab(url))).toBe(Icon)
  })

  it('keeps webview tabs on the globe icon', () => {
    expect(getTabIcon(webviewTab('https://example.com'))).toBe(Globe)
  })

  it('keeps unknown routes on the message icon fallback', () => {
    expect(getTabIcon(routeTab('/unknown'))).toBe(MessageCircle)
    expect(getTabIcon(routeTab('/app/openclaw'))).toBe(MessageCircle)
  })
})
