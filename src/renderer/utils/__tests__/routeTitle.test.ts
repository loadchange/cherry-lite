import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock i18n before importing the module
vi.mock('@renderer/i18n/resolver', () => ({
  default: {
    t: vi.fn((key: string) => {
      const translations: Record<string, string> = {
        'agent.session.group.conversation': '对话',
        'title.translate': '翻译',
        'title.launchpad': '启动台',
        'title.settings': '设置'
      }
      return translations[key] || key
    })
  }
}))

import {
  getDefaultRouteTitle,
  getRouteTitleKey,
  isPageTitledRoute,
  isTopLevelRoute,
  shouldAutoLocalizeRouteTitle
} from '../routeTitle'

describe('routeTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getDefaultRouteTitle', () => {
    describe('exact route matches', () => {
      it.each([
        ['/app/chat', '对话'],
        ['/app/translate', '翻译'],
        ['/app/launchpad', '启动台'],
        ['/settings', '设置']
      ])('should return correct title for %s', (url, expectedTitle) => {
        expect(getDefaultRouteTitle(url)).toBe(expectedTitle)
      })
    })

    describe('nested route matches', () => {
      it('should match base path for nested routes', () => {
        expect(getDefaultRouteTitle('/app/chat/topic-123')).toBe('对话')
        expect(getDefaultRouteTitle('/settings/provider')).toBe('设置')
        expect(getDefaultRouteTitle('/settings/mcp/servers')).toBe('设置')
      })
    })

    describe('URL with query params and hash', () => {
      it('should handle URLs with query parameters', () => {
        expect(getDefaultRouteTitle('/app/chat?topicId=123')).toBe('对话')
        expect(getDefaultRouteTitle('/settings/provider?id=openai')).toBe('设置')
      })

      it('should handle URLs with hash', () => {
        expect(getDefaultRouteTitle('/app/translate#section1')).toBe('翻译')
      })

      it('should handle URLs with both query and hash', () => {
        expect(getDefaultRouteTitle('/app/chat?id=1#message-5')).toBe('对话')
      })
    })

    describe('unknown routes', () => {
      it('should return last segment for unknown routes', () => {
        expect(getDefaultRouteTitle('/unknown')).toBe('unknown')
        expect(getDefaultRouteTitle('/app/openclaw')).toBe('openclaw')
        expect(getDefaultRouteTitle('/foo/bar/baz')).toBe('baz')
      })

      it('should return pathname for root-like unknown routes', () => {
        expect(getDefaultRouteTitle('/x')).toBe('x')
      })
    })

    describe('edge cases', () => {
      it('should handle trailing slashes', () => {
        expect(getDefaultRouteTitle('/app/chat/')).toBe('对话')
        expect(getDefaultRouteTitle('/settings/')).toBe('设置')
      })

      it('should handle double slashes (protocol-relative URL)', () => {
        // '//chat' is a protocol-relative URL, so 'chat' becomes the hostname
        // This is expected behavior per URL standard
        expect(getDefaultRouteTitle('//chat')).toBe('/')
      })

      it('should handle relative-like paths', () => {
        // URL constructor with base will normalize these
        expect(getDefaultRouteTitle('app/chat')).toBe('对话')
        expect(getDefaultRouteTitle('./app/chat')).toBe('对话')
      })
    })
  })

  describe('getRouteTitleKey', () => {
    describe('exact matches', () => {
      it.each([
        ['/app/chat', 'agent.session.group.conversation'],
        ['/app/translate', 'title.translate'],
        ['/settings', 'title.settings']
      ])('should return i18n key for %s', (url, expectedKey) => {
        expect(getRouteTitleKey(url)).toBe(expectedKey)
      })
    })

    describe('base path matches', () => {
      it('should return base path key for nested routes', () => {
        expect(getRouteTitleKey('/app/chat/topic-123')).toBe('agent.session.group.conversation')
        expect(getRouteTitleKey('/settings/provider')).toBe('title.settings')
      })
    })

    describe('unknown routes', () => {
      it('should return undefined for unknown routes', () => {
        expect(getRouteTitleKey('/unknown')).toBeUndefined()
        expect(getRouteTitleKey('/app/openclaw')).toBeUndefined()
        expect(getRouteTitleKey('/foo/bar')).toBeUndefined()
      })
    })
  })

  describe('isTopLevelRoute', () => {
    it('returns true only for bare top-level route tabs', () => {
      expect(isTopLevelRoute('/app/chat')).toBe(true)
      expect(isTopLevelRoute('/app/translate')).toBe(true)
      expect(isTopLevelRoute('/app/chat?topicId=123&view=message')).toBe(false)
      expect(isTopLevelRoute('/app/translate#section')).toBe(false)
      expect(isTopLevelRoute('/app/chat/topic-123')).toBe(false)
    })
  })

  describe('isPageTitledRoute', () => {
    it('treats chat routes as page-titled regardless of query/sub-path', () => {
      expect(isPageTitledRoute('/app/chat')).toBe(true)
      expect(isPageTitledRoute('/app/chat?topicId=123')).toBe(true)
      expect(isPageTitledRoute('/app/chat/topic-123')).toBe(true)
    })

    it('treats route-titled apps as not page-titled', () => {
      expect(isPageTitledRoute('/app/translate')).toBe(false)
      expect(isPageTitledRoute('/settings')).toBe(false)
    })
  })

  describe('shouldAutoLocalizeRouteTitle', () => {
    it.each([
      // Top-level routes always re-localize.
      ['/app/chat', true],
      ['/app/translate', true],
      ['/settings', true],
      // Any /settings sub-route re-localizes.
      ['/settings/provider/openai', true],
      // Chat sub-routes preserve caller-supplied per-entity titles.
      ['/app/chat/123', false],
      // Unknown routes are not auto-localized.
      ['/unknown', false]
    ])('should return %s -> %s', (url, expected) => {
      expect(shouldAutoLocalizeRouteTitle(url)).toBe(expected)
    })
  })
})
