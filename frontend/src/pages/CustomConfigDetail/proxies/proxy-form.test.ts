import { describe, expect, it } from 'vitest'
import type { ProxyNode } from '@/types'
import {
  defaultProxyForm,
  formToProxyNode,
  proxyNodeToForm,
  proxyToYaml,
  validateProxyForm,
  yamlToProxy,
} from './proxy-form'

const UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const PUBLIC_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

const realityNode: ProxyNode = {
  name: 'reality',
  type: 'vless',
  server: 'example.com',
  port: 443,
  uuid: UUID,
  network: 'tcp',
  tls: true,
  flow: 'xtls-rprx-vision',
  encryption: 'none',
  servername: 'sni.example.com',
  'client-fingerprint': 'chrome',
  'reality-opts': {
    'public-key': PUBLIC_KEY,
    'short-id': '',
    'future-option': { enabled: true },
  },
  udp: true,
  'packet-encoding': 'xudp',
  'custom-nested': { enabled: true, values: ['a', 'b'] },
}

describe('proxy form YAML and VLESS preservation', () => {
  it('round-trips nested YAML safely and keeps a numeric-looking short-id a string', () => {
    const yaml = proxyToYaml(realityNode)
    expect(yaml).toContain('reality-opts:')
    expect(yaml).toContain("short-id: ''")

    const parsed = yamlToProxy(`
type: vless
name: reality
server: example.com
port: 443
tls: true
reality-opts:
  public-key: ${PUBLIC_KEY}
  short-id: 0123
custom-nested:
  enabled: true
`)
    expect(parsed['reality-opts']).toEqual({
      'public-key': PUBLIC_KEY,
      'short-id': '0123',
    })
    expect(parsed['custom-nested']).toEqual({ enabled: true })

    const roundTrip = yamlToProxy(proxyToYaml(parsed))
    expect(roundTrip).toEqual(parsed)
  })

  it('rejects YAML roots and type values that cannot represent a proxy node', () => {
    expect(() => yamlToProxy('- type: vless')).toThrow()
    expect(() => yamlToProxy('null')).toThrow()
    expect(() => yamlToProxy('type: 123')).toThrow()
    expect(() => yamlToProxy('type:\n  nested: true')).toThrow()
  })

  it('preserves undisplayed VLESS fields through ordinary form editing', () => {
    const form = proxyNodeToForm(realityNode)
    form.name = 'edited'
    const edited = formToProxyNode(form)

    expect(edited).toEqual({ ...realityNode, name: 'edited' })
    expect((edited['reality-opts'] as Record<string, unknown>)['short-id']).toBe('')
    expect((edited['reality-opts'] as Record<string, unknown>)['future-option']).toEqual({ enabled: true })
    expect(form.realityEnabled).toBe(true)
  })

  it('removes TLS/Reality conflicts when those options are disabled', () => {
    const form = proxyNodeToForm(realityNode)
    form.realityEnabled = false
    const withoutReality = formToProxyNode(form)
    expect(withoutReality['reality-opts']).toBeUndefined()
    expect(withoutReality.servername).toBe('sni.example.com')

    form.tls = false
    const withoutTls = formToProxyNode(form)
    expect(withoutTls.tls).toBe(false)
    expect(withoutTls.servername).toBeUndefined()
    expect(withoutTls['client-fingerprint']).toBeUndefined()
    expect(withoutTls['reality-opts']).toBeUndefined()
    expect(withoutTls.udp).toBe(true)
    expect(withoutTls['packet-encoding']).toBe('xudp')
  })

  it('does not carry VLESS preserved fields across a protocol switch', () => {
    const form = proxyNodeToForm(realityNode)
    const switched = formToProxyNode({
      ...form,
      type: 'vmess',
    })
    expect(switched.type).toBe('vmess')
    expect(switched['reality-opts']).toBeUndefined()
    expect(switched['custom-nested']).toBeUndefined()
    expect(switched.uuid).toBe(UUID)
  })

  it('removes old transport options when the VLESS network is changed', () => {
    const form = proxyNodeToForm({
      ...realityNode,
      network: 'ws',
      'ws-opts': { path: '/' },
    })
    form.network = 'tcp'
    const changed = formToProxyNode(form)
    expect(changed.network).toBe('tcp')
    expect(changed['ws-opts']).toBeUndefined()
  })

  it('validates form-only values before saving', () => {
    const form = proxyNodeToForm(realityNode)
    expect(validateProxyForm(form)).toBeNull()

    form.encryption = 'mlkem768x25519plus.native'
    expect(validateProxyForm(form)).toBe('unsupported-encryption')
    form.encryption = defaultProxyForm.encryption
    form.flow = 'other'
    expect(validateProxyForm(form)).toBe('unsupported-flow')
    form.flow = 'xtls-rprx-vision'
    form.tls = false
    expect(validateProxyForm(form)).toBe('flow-requires-tls')
  })
})
