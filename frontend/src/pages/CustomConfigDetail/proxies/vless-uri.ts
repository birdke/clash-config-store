import type { ProxyNode } from '@/types'

export const VLESS_FLOW = 'xtls-rprx-vision'
export const VLESS_DEFAULT_ENCRYPTION = 'none'

/**
 * Exact client-fingerprint keys exposed by Mihomo 1.19.31/1.19.32's
 * component/tls/utls.go, including its classical and randomized aliases.
 */
export const SUPPORTED_VLESS_CLIENT_FINGERPRINTS = [
  'chrome',
  'firefox',
  'safari',
  'ios',
  'android',
  'edge',
  '360',
  'qq',
  'random',
  'chrome120',
  'firefox120',
  'safari16',
  'chrome_psk',
  'chrome_psk_shuffle',
  'chrome_padding_psk_shuffle',
  'chrome_pq',
  'chrome_pq_psk',
  'randomized',
  'none',
] as const

export type VlessUriErrorCode =
  | 'empty'
  | 'invalid-uri'
  | 'unsupported-scheme'
  | 'invalid-percent-encoding'
  | 'invalid-userinfo'
  | 'invalid-uuid'
  | 'missing-server'
  | 'invalid-host'
  | 'missing-port'
  | 'invalid-port'
  | 'unsupported-path'
  | 'unsupported-query'
  | 'conflicting-query'
  | 'unsupported-transport'
  | 'unsupported-header-type'
  | 'unsupported-security'
  | 'security-conflict'
  | 'missing-public-key'
  | 'invalid-public-key'
  | 'invalid-short-id'
  | 'unsupported-encryption'
  | 'unsupported-flow'
  | 'flow-requires-tls'
  | 'invalid-fingerprint'
  | 'reality-requires-tls'

/**
 * Deliberately contains only a code and a non-secret field name. Never include the
 * pasted URI, UUID, public key, or query values in an error message.
 */
export class VlessUriError extends Error {
  readonly code: VlessUriErrorCode
  readonly field?: string

  constructor(code: VlessUriErrorCode, field?: string) {
    super(code)
    this.name = 'VlessUriError'
    this.code = code
    this.field = field
  }
}

export function getVlessUriErrorCode(error: unknown): VlessUriErrorCode {
  return error instanceof VlessUriError ? error.code : 'invalid-uri'
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const DECIMAL_RE = /^\d+$/
const HEX_RE = /^[0-9a-fA-F]+$/
const BASE64URL_RE = /^[A-Za-z0-9_-]+={0,2}$/
const ALLOWED_QUERY_KEYS = new Set([
  'security',
  'type',
  'encryption',
  'flow',
  'sni',
  'fp',
  'pbk',
  'sid',
  'headerType',
])

export interface VlessFormValidationInput {
  uuid: string
  server: string
  port: string | number
  tls: boolean
  flow: string
  encryption: string
  clientFingerprint: string
  realityEnabled: boolean
  realityPublicKey: string
  realityShortId: string
}

function fail(code: VlessUriErrorCode, field?: string): never {
  throw new VlessUriError(code, field)
}

function decodeComponent(value: string, plusAsSpace = false): string {
  try {
    return decodeURIComponent(plusAsSpace ? value.replace(/\+/g, ' ') : value)
  } catch {
    fail('invalid-percent-encoding')
  }
}

function isSupportedFingerprint(value: string): boolean {
  return (SUPPORTED_VLESS_CLIENT_FINGERPRINTS as readonly string[]).includes(value)
}

export function isStandardUuid(value: string): boolean {
  return UUID_RE.test(value)
}

/** Strict base64url validation followed by a decoded-size check for a Reality key. */
export function isValidRealityPublicKey(value: string): boolean {
  if (!BASE64URL_RE.test(value)) return false
  const unpadded = value.replace(/=+$/, '')
  if (unpadded.length % 4 === 1) return false

  const normalized = unpadded.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  try {
    // atob is available in browsers and in the Node versions used by Vitest.
    const binary = atob(padded)
    if (binary.length !== 32) return false
    const canonical = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    return canonical === unpadded
  } catch {
    return false
  }
}

export function isValidRealityShortId(value: string): boolean {
  return value === '' || (value.length <= 16 && value.length % 2 === 0 && HEX_RE.test(value))
}

function parsePort(value: string): number {
  if (!DECIMAL_RE.test(value)) fail('invalid-port')
  const port = Number(value)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) fail('invalid-port')
  return port
}

function splitAuthorityPort(authorityHost: string): { rawHost: string; rawPort: string } {
  if (!authorityHost) fail('missing-server')
  if (authorityHost.startsWith('[')) {
    const closing = authorityHost.indexOf(']')
    if (closing < 0) fail('invalid-host')
    const suffix = authorityHost.slice(closing + 1)
    if (!suffix) fail('missing-port')
    if (!suffix.startsWith(':')) fail('invalid-host')
    if (suffix.length === 1) fail('missing-port')
    return { rawHost: authorityHost.slice(0, closing + 1), rawPort: suffix.slice(1) }
  }

  const colon = authorityHost.lastIndexOf(':')
  if (colon < 0) fail('missing-port')
  const rawHost = authorityHost.slice(0, colon)
  const rawPort = authorityHost.slice(colon + 1)
  if (!rawHost) fail('missing-server')
  if (!rawPort) fail('missing-port')
  if (rawHost.includes(':')) fail('invalid-host')
  return { rawHost, rawPort }
}

function rawUriParts(value: string): {
  authority: string
  rawQuery: string
  rawFragment: string
} {
  const schemeSeparator = value.indexOf('://')
  if (schemeSeparator < 0) fail('invalid-uri')

  const hashIndex = value.indexOf('#', schemeSeparator + 3)
  const beforeHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value
  const queryIndex = beforeHash.indexOf('?')
  const authorityAndPath = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash
  const rawQuery = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : ''
  const rawFragment = hashIndex >= 0 ? value.slice(hashIndex + 1) : ''

  const authorityStart = schemeSeparator + 3
  const authorityText = authorityAndPath.slice(authorityStart)
  const authorityEnd = authorityText.search(/[\\/]/)
  const end = authorityEnd < 0 ? authorityText.length : authorityEnd
  return {
    authority: authorityText.slice(0, end),
    rawQuery,
    rawFragment,
  }
}

function collectQueryParams(rawQuery: string): Map<string, string> {
  if (rawQuery) {
    for (const component of rawQuery.split('&')) {
      if (component) decodeComponent(component, true)
    }
  }

  const params = new URLSearchParams(rawQuery)
  const values = new Map<string, string>()
  for (const [key, value] of params.entries()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) fail('unsupported-query', key)
    const previous = values.get(key)
    if (previous !== undefined && previous !== value) fail('conflicting-query', key)
    values.set(key, value)
  }
  return values
}

function queryValue(params: Map<string, string>, key: string): string | undefined {
  return params.get(key)
}

function queryHas(params: Map<string, string>, key: string): boolean {
  return params.has(key)
}

/**
 * Parse one local vless:// share link into an ordinary Mihomo VLESS node.
 * No network, DNS, storage, logging, or backend calls are performed here.
 */
export function parseVlessUri(input: string): ProxyNode {
  const value = input.trim()
  if (!value) fail('empty')

  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)) fail('invalid-uri')
  const schemeSeparator = value.indexOf('://')
  const scheme = value.slice(0, schemeSeparator).toLowerCase()
  if (scheme !== 'vless') fail('unsupported-scheme')
  const { authority, rawQuery, rawFragment } = rawUriParts(value)
  const at = authority.indexOf('@')
  if (at <= 0 || at !== authority.lastIndexOf('@')) fail('invalid-userinfo')
  const rawUserInfo = authority.slice(0, at)
  if (rawUserInfo.includes(':')) fail('invalid-userinfo')
  const uuid = decodeComponent(rawUserInfo)
  if (!isStandardUuid(uuid)) fail('invalid-uuid')

  const { rawHost, rawPort } = splitAuthorityPort(authority.slice(at + 1))
  if (!rawHost) fail('missing-server')
  if (rawHost.includes('%')) fail('invalid-percent-encoding')
  const port = parsePort(rawPort)

  let url: URL
  try {
    url = new URL(value)
  } catch {
    fail('invalid-uri')
  }

  if (url.protocol.toLowerCase() !== 'vless:') fail('unsupported-scheme')
  if (!/^vless:\/\//i.test(value)) fail('invalid-uri')

  let server = url.hostname
  if (server.startsWith('[') && server.endsWith(']')) server = server.slice(1, -1)
  if (!server) fail('missing-server')
  if (url.pathname && url.pathname !== '/') fail('unsupported-path')

  const decodedFragment = decodeComponent(rawFragment)
  const name = decodedFragment.trim() ? decodedFragment : `VLESS ${server}:${port}`
  const params = collectQueryParams(rawQuery)

  const transport = queryValue(params, 'type')
  if (transport !== undefined && transport !== 'tcp') fail('unsupported-transport', 'type')

  const headerType = queryValue(params, 'headerType')
  if (headerType !== undefined && headerType !== 'none') {
    fail('unsupported-header-type', 'headerType')
  }

  const security = queryValue(params, 'security') ?? 'none'
  if (security !== 'none' && security !== 'tls' && security !== 'reality') {
    fail('unsupported-security', 'security')
  }

  const encryption = queryValue(params, 'encryption')
  if (encryption !== undefined && encryption !== '' && encryption !== VLESS_DEFAULT_ENCRYPTION) {
    fail('unsupported-encryption', 'encryption')
  }

  const flow = queryValue(params, 'flow') ?? ''
  if (flow !== '' && flow !== VLESS_FLOW) fail('unsupported-flow', 'flow')
  if (flow === VLESS_FLOW && security === 'none') fail('flow-requires-tls', 'flow')

  const sni = queryValue(params, 'sni')
  const fingerprint = queryValue(params, 'fp')
  const hasRealityParams = queryHas(params, 'pbk') || queryHas(params, 'sid')
  if (security === 'none' && (sni !== undefined || fingerprint !== undefined || hasRealityParams)) {
    fail('security-conflict')
  }
  if (security === 'tls' && hasRealityParams) fail('security-conflict')

  if (fingerprint !== undefined && fingerprint !== 'none' && fingerprint !== '' && !isSupportedFingerprint(fingerprint)) {
    fail('invalid-fingerprint', 'fp')
  }

  const node: ProxyNode = {
    name,
    type: 'vless',
    server,
    port,
    uuid,
    network: 'tcp',
    tls: security !== 'none',
    encryption: VLESS_DEFAULT_ENCRYPTION,
  }
  if (flow) node.flow = flow
  if (sni) node.servername = sni
  if (fingerprint) node['client-fingerprint'] = fingerprint

  if (security === 'reality') {
    const publicKey = queryValue(params, 'pbk')
    if (!publicKey) fail('missing-public-key', 'pbk')
    if (!isValidRealityPublicKey(publicKey)) fail('invalid-public-key', 'pbk')
    const shortId = queryValue(params, 'sid') ?? ''
    if (!isValidRealityShortId(shortId)) fail('invalid-short-id', 'sid')
    node['reality-opts'] = {
      'public-key': publicKey,
      'short-id': shortId,
    }
  }

  return node
}

/** Shared validation for the editable VLESS form and URI-produced nodes. */
export function validateVlessFields(input: VlessFormValidationInput): VlessUriErrorCode | null {
  if (!isStandardUuid(input.uuid)) return 'invalid-uuid'
  if (!input.server.trim()) return 'missing-server'

  const portText = String(input.port)
  if (!portText) return 'missing-port'
  if (!DECIMAL_RE.test(portText)) return 'invalid-port'
  const port = Number(portText)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) return 'invalid-port'

  if (input.encryption !== '' && input.encryption !== VLESS_DEFAULT_ENCRYPTION) {
    return 'unsupported-encryption'
  }
  if (input.flow !== '' && input.flow !== VLESS_FLOW) return 'unsupported-flow'
  if (input.flow === VLESS_FLOW && !input.tls) return 'flow-requires-tls'
  if (input.clientFingerprint && !isSupportedFingerprint(input.clientFingerprint)) {
    return 'invalid-fingerprint'
  }
  if (!input.realityEnabled) return null
  if (!input.tls) return 'reality-requires-tls'
  if (!input.realityPublicKey) return 'missing-public-key'
  if (!isValidRealityPublicKey(input.realityPublicKey)) return 'invalid-public-key'
  if (!isValidRealityShortId(input.realityShortId)) return 'invalid-short-id'
  return null
}
