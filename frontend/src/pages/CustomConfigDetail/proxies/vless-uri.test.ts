import { describe, expect, it } from 'vitest'
import {
  getVlessUriErrorCode,
  isValidRealityPublicKey,
  isValidRealityShortId,
  parseVlessUri,
} from './vless-uri'

const UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const PUBLIC_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const URL_SAFE_PUBLIC_KEY = '__________________________________________8'

function uri(query = 'security=none', host = 'example.com:443', fragment = 'Node') {
  return `vless://${UUID}@${host}?${query}#${fragment}`
}

function expectError(value: string, code: string) {
  try {
    parseVlessUri(value)
    throw new Error('expected parser to reject the URI')
  } catch (error) {
    expect(getVlessUriErrorCode(error)).toBe(code)
  }
}

describe('parseVlessUri', () => {
  it('maps Reality Vision links to an ordinary VLESS node and keeps empty sid as a string', () => {
    const node = parseVlessUri(uri(
      `type=tcp&security=reality&encryption=none&flow=xtls-rprx-vision&sni=example.com&fp=chrome&pbk=${PUBLIC_KEY}&sid=&headerType=none`,
      'example.com:443',
      'Reality%20%E6%B5%8B%E8%AF%95%20%23',
    ))

    expect(node).toEqual({
      name: 'Reality 测试 #',
      type: 'vless',
      server: 'example.com',
      port: 443,
      uuid: UUID,
      network: 'tcp',
      tls: true,
      encryption: 'none',
      flow: 'xtls-rprx-vision',
      servername: 'example.com',
      'client-fingerprint': 'chrome',
      'reality-opts': {
        'public-key': PUBLIC_KEY,
        'short-id': '',
      },
    })
  })

  it('accepts missing sid, arbitrary UUID variant/version, and all port boundaries', () => {
    const missingSid = parseVlessUri(uri(`security=reality&pbk=${PUBLIC_KEY}`, 'example.com:1'))
    expect(missingSid.port).toBe(1)
    expect((missingSid['reality-opts'] as Record<string, unknown>)['short-id']).toBe('')
    expect(parseVlessUri(uri(`security=reality&pbk=${PUBLIC_KEY}`, 'example.com:65535')).port).toBe(65535)
    expect(parseVlessUri(uri('security=none', '192.0.2.10:80')).tls).toBe(false)
  })

  it('accepts bracketed IPv6 and removes the brackets from the saved server', () => {
    const node = parseVlessUri(uri('security=none', '[2001:db8::1]:443', 'IPv6'))
    expect(node.server).toBe('2001:db8::1')
  })

  it('supports TLS and cleartext defaults, including omitted or none encryption', () => {
    expect(parseVlessUri(uri('security=tls')).tls).toBe(true)
    expect(parseVlessUri(uri('security=none')).encryption).toBe('none')
    expect(parseVlessUri(uri('security=none&encryption=none')).encryption).toBe('none')
    expect(parseVlessUri(uri('security=none&encryption=')).encryption).toBe('none')
  })

  it('generates a safe editable name when the fragment is absent or blank', () => {
    expect(parseVlessUri('vless://00000000-0000-0000-0000-000000000001@example.com:443?security=none').name)
      .toBe('VLESS example.com:443')
    expect(parseVlessUri(uri('security=none', 'example.com:443', '%20%20')).name)
      .toBe('VLESS example.com:443')
  })

  it('accepts repeated identical values but rejects conflicting repeats', () => {
    expect(parseVlessUri(uri('security=none&security=none&type=tcp&type=tcp')).type).toBe('vless')
    expectError(uri('security=none&security=tls'), 'conflicting-query')
  })

  it('rejects invalid ports, UUIDs, missing authority parts, and non-vless schemes', () => {
    expectError(uri('security=none', 'example.com:0'), 'invalid-port')
    expectError(uri('security=none', 'example.com:65536'), 'invalid-port')
    expectError('vless://ffffffffffffffffffffffffffffffff@example.com:443?security=none', 'invalid-uuid')
    expectError('vless://00000000-0000-0000-0000-000000000001@example.com?security=none', 'missing-port')
    expectError('vless://00000000-0000-0000-0000-000000000001@:443?security=none', 'missing-server')
    expectError('https://00000000-0000-0000-0000-000000000001@example.com:443', 'unsupported-scheme')
  })

  it('rejects unknown parameters and unsupported transports without silently dropping them', () => {
    expectError(uri('security=none&path=%2F'), 'unsupported-query')
    expectError(uri('security=none&type=ws'), 'unsupported-transport')
    expectError(uri('security=none&type=quic'), 'unsupported-transport')
    expectError(uri('security=none&headerType=http'), 'unsupported-header-type')
    expectError('vless://00000000-0000-0000-0000-000000000001@example.com:443/foo?security=none', 'unsupported-path')
  })

  it('enforces security, flow, encryption, and Mihomo fingerprint boundaries', () => {
    expectError(uri(`security=none&flow=xtls-rprx-vision`), 'flow-requires-tls')
    expectError(uri(`security=tls&flow=other-flow`), 'unsupported-flow')
    expectError(uri('security=none&encryption=mlkem768x25519plus.native'), 'unsupported-encryption')
    expectError(uri('security=tls&fp=not-a-mihomo-fingerprint'), 'invalid-fingerprint')
    expect(parseVlessUri(uri('security=tls&fp=ios'))['client-fingerprint']).toBe('ios')
    expect(parseVlessUri(uri('security=tls&fp=randomized'))['client-fingerprint']).toBe('randomized')
    expect(parseVlessUri(uri('security=tls&fp=none'))['client-fingerprint']).toBe('none')
    expectError(uri(`security=none&sni=example.com`), 'security-conflict')
    expectError(uri(`security=tls&pbk=${PUBLIC_KEY}`), 'security-conflict')
    expectError(uri(`security=none&sid=01`), 'security-conflict')
  })

  it('allows empty Reality short-id but validates non-empty even hex values', () => {
    expect(isValidRealityShortId('')).toBe(true)
    expect(isValidRealityShortId('0a')).toBe(true)
    expect(isValidRealityShortId('0123456789abcdef')).toBe(true)
    expect(isValidRealityShortId('a')).toBe(false)
    expect(isValidRealityShortId('0123456789abcdef00')).toBe(false)
    expect(isValidRealityShortId('zz')).toBe(false)
    expectError(uri(`security=reality&pbk=${PUBLIC_KEY}&sid=a`), 'invalid-short-id')
    expectError(uri(`security=reality&pbk=${PUBLIC_KEY}&sid=0123456789abcdef00`), 'invalid-short-id')
  })

  it('requires a base64url Reality public key that decodes to exactly 32 bytes', () => {
    expect(isValidRealityPublicKey(PUBLIC_KEY)).toBe(true)
    expect(isValidRealityPublicKey(URL_SAFE_PUBLIC_KEY)).toBe(true)
    expectError(uri('security=reality'), 'missing-public-key')
    expectError(uri('security=reality&pbk=not-base64url'), 'invalid-public-key')
    expectError(uri('security=reality&pbk=AA'), 'invalid-public-key')
    expectError(uri('security=reality&pbk=AA&sid=01'), 'invalid-public-key')
  })

  it('accepts valid percent-encoded fragments and rejects malformed percent encoding', () => {
    expect(parseVlessUri(uri('security=none', 'example.com:443', 'hello%20world')).name).toBe('hello world')
    expectError(uri('security=none', 'example.com:443', 'bad%ZZ'), 'invalid-percent-encoding')
    expectError(uri('security=none%ZZ'), 'invalid-percent-encoding')
  })

  it('never echoes the pasted link or credentials in parser errors', () => {
    const secretUri = uri(`security=reality&pbk=${PUBLIC_KEY}&sid=01`, 'example.com:443', 'secret')
    const invalidUri = secretUri.replace('#secret', '&unexpected=1#secret')
    try {
      parseVlessUri(invalidUri)
    } catch (error) {
      expect(String(error)).not.toContain(invalidUri)
      expect(String(error)).not.toContain(UUID)
      expect(String(error)).not.toContain(PUBLIC_KEY)
    }
  })
})
