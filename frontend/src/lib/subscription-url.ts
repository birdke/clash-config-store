export interface SubscriptionUrlInput {
  token?: string
  subscription_url?: string | null
}

const fallbackOrigin = 'http://subscription.invalid'

function isHttpProtocol(protocol: string): boolean {
  return protocol === 'http:' || protocol === 'https:'
}

function parseHttpUrl(value: string): URL | null {
  if (!/^https?:\/\//i.test(value)) {
    return null
  }

  try {
    const parsed = new URL(value)
    return isHttpProtocol(parsed.protocol) && parsed.hostname ? parsed : null
  } catch {
    return null
  }
}

function currentHttpOrigin(): string | null {
  if (typeof window === 'undefined' || typeof window.location?.origin !== 'string') {
    return null
  }

  return parseHttpUrl(window.location.origin)?.origin ?? null
}

function fallbackSubscriptionPath(token?: string): string {
  const safeToken = typeof token === 'string' ? token.trim() : ''
  return `/sub/${safeToken ? encodeURIComponent(safeToken) : ''}`
}

function resolveRootRelativeUrl(value: string, origin: string | null): string | null {
  if (!value.startsWith('/') || value.startsWith('//')) {
    return null
  }

  const base = origin ?? fallbackOrigin
  try {
    const resolved = new URL(value, base)
    if (resolved.origin !== base) {
      return null
    }
    return origin ? resolved.toString() : value
  } catch {
    return null
  }
}

/**
 * 统一生成订阅对外访问链接。
 * 后端未显式配置 BASE_URL 时返回 /sub/<token>，浏览器中补当前页面 origin。
 * 仅接受 HTTP(S) 绝对 URL 和安全的根相对路径；无 window 时保留相对路径。
 */
export function subscriptionPublicUrl(
  sub: SubscriptionUrlInput
): string {
  const origin = currentHttpOrigin()
  const fallbackPath = fallbackSubscriptionPath(sub.token)
  const fallback = origin ? `${origin}${fallbackPath}` : fallbackPath
  const value = typeof sub.subscription_url === 'string' ? sub.subscription_url.trim() : ''

  if (!value) {
    return fallback
  }

  if (parseHttpUrl(value)) {
    return value
  }

  return resolveRootRelativeUrl(value, origin) ?? fallback
}
