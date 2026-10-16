import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { subscriptionPublicUrl } from './subscription-url'

const originalWindow = globalThis.window

function setWindowOrigin(origin: string) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { origin } },
  })
}

function removeWindow() {
  Reflect.deleteProperty(globalThis, 'window')
}

beforeEach(removeWindow)

afterEach(() => {
  if (originalWindow === undefined) {
    removeWindow()
    return
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  })
})

describe('subscriptionPublicUrl', () => {
  it('uses the current HTTP origin and preserves a non-default port', () => {
    setWindowOrigin('http://localhost:26406')
    expect(
      subscriptionPublicUrl({ token: 'synthetic-token', subscription_url: '/sub/synthetic-token' })
    ).toBe('http://localhost:26406/sub/synthetic-token')

    setWindowOrigin('https://panel.example:8443')
    expect(
      subscriptionPublicUrl({ token: 'synthetic-token', subscription_url: '/sub/synthetic-token' })
    ).toBe('https://panel.example:8443/sub/synthetic-token')
  })

  it('honors explicit HTTP(S) URLs, including explicit localhost', () => {
    setWindowOrigin('http://localhost:5173')
    expect(
      subscriptionPublicUrl({
        token: 'synthetic-token',
        subscription_url: 'https://public.example:8443/panel/sub/synthetic-token',
      })
    ).toBe('https://public.example:8443/panel/sub/synthetic-token')

    expect(
      subscriptionPublicUrl({
        token: 'synthetic-token',
        subscription_url: 'http://localhost:26406/sub/synthetic-token',
      })
    ).toBe('http://localhost:26406/sub/synthetic-token')
  })

  it('falls back to the token path when subscription_url is missing', () => {
    setWindowOrigin('https://panel.example')
    expect(subscriptionPublicUrl({ token: 'synthetic-token' })).toBe(
      'https://panel.example/sub/synthetic-token'
    )
  })

  it('keeps relative URLs when window is unavailable', () => {
    expect(
      subscriptionPublicUrl({ token: 'synthetic-token', subscription_url: '/sub/synthetic-token' })
    ).toBe('/sub/synthetic-token')
    expect(
      subscriptionPublicUrl({
        token: 'synthetic-token',
        subscription_url: 'https://public.example/panel/sub/synthetic-token',
      })
    ).toBe('https://public.example/panel/sub/synthetic-token')
  })

  it('rejects protocol-relative, non-HTTP(S), and malformed values without throwing', () => {
    setWindowOrigin('https://panel.example:8443')
    const unsafeValues = ['//evil.example/sub/synthetic-token', 'javascript:alert(1)', 'ftp://evil.example/sub/synthetic-token', 'https://[invalid']

    for (const subscription_url of unsafeValues) {
      expect(() => subscriptionPublicUrl({ token: 'synthetic-token', subscription_url })).not.toThrow()
      expect(subscriptionPublicUrl({ token: 'synthetic-token', subscription_url })).toBe(
        'https://panel.example:8443/sub/synthetic-token'
      )
    }
  })
})
