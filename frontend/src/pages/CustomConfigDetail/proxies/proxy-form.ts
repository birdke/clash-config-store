import type { ProxyNode, ProxyGroup } from '@/types'
import { hasProxyOrGroupNameConflict } from '@/lib/rename-refs'
import { dump, FAILSAFE_SCHEMA, JSON_SCHEMA, load } from 'js-yaml'
import {
  VLESS_DEFAULT_ENCRYPTION,
  validateVlessFields,
} from './vless-uri'
import type { VlessUriErrorCode } from './vless-uri'

// ─────────────────────────────────────────────
// 工具函数：简单对象 <-> YAML 字符串互转
// ─────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T
  if (isRecord(value)) {
    const cloned: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) cloned[key] = cloneValue(item)
    return cloned as T
  }
  return value
}

function restoreShortIdStrings(value: unknown, lexical: unknown): unknown {
  if (Array.isArray(value)) {
    const lexicalItems = Array.isArray(lexical) ? lexical : []
    return value.map((item, index) => restoreShortIdStrings(item, lexicalItems[index]))
  }
  if (!isRecord(value)) return value
  const lexicalRecord = isRecord(lexical) ? lexical : {}
  const restored: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (key === 'short-id' && Object.prototype.hasOwnProperty.call(lexicalRecord, key)) {
      restored[key] = String(lexicalRecord[key])
    } else {
      restored[key] = restoreShortIdStrings(item, lexicalRecord[key])
    }
  }
  return restored
}

/** 将代理节点对象序列化为安全的 YAML 字符串，支持任意嵌套字段。 */
export function proxyToYaml(proxy: Record<string, unknown>): string {
  const serializable: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(proxy)) {
    if (key !== '__raw__' && value !== undefined && value !== null) {
      serializable[key] = cloneValue(value)
    }
  }
  return dump(serializable, {
    schema: JSON_SCHEMA,
    noRefs: true,
    lineWidth: -1,
  }).trimEnd()
}

/** 与 proxyToYaml 一致的标量引号规则，用于补丁替换 YAML 中的 name 行 */
export function yamlScalarForProxyName(val: string): string {
  if (/[:#{}[\]|>&*!,?]/.test(val) || val.includes('\n')) {
    return `"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return val
}

/** 自定义节点：替换首处 name 行（支持 `- name:` / `name:`） */
export function replaceProxyYamlNameLine(rawYaml: string, newName: string): string {
  return rawYaml.replace(/^(\s*(?:-\s+)?name:\s*)(.+)$/m, (_, p1: string) => `${p1}${yamlScalarForProxyName(newName)}`)
}

/** 将代理节点 YAML 安全解析为对象，保留嵌套 Reality/transport 字段。 */
export function yamlToProxy(yaml: string): Record<string, unknown> {
  let parsed: unknown
  let lexical: unknown
  try {
    // Use JSON_SCHEMA for normal booleans/numbers, then restore lexical
    // short-id values below because YAML's implicit numeric schema is too broad.
    parsed = load(yaml, { schema: JSON_SCHEMA })
    // js-yaml's standard schemas resolve an unquoted 0123 as a number. Parse a
    // second safe lexical view so the short-id key can be restored exactly.
    lexical = load(yaml, { schema: FAILSAFE_SCHEMA })
  } catch {
    throw new Error('invalid-proxy-yaml')
  }
  if (!isRecord(parsed)) throw new Error('proxy-yaml-must-be-object')
  if (typeof parsed.type !== 'string' || !parsed.type.trim()) {
    throw new Error('proxy-yaml-type-must-be-string')
  }
  return restoreShortIdStrings(parsed, lexical) as Record<string, unknown>
}

// ─────────────────────────────────────────────
// 代理节点协议类型
// ─────────────────────────────────────────────

export type ProxyProtocol =
  | 'ss' | 'vmess' | 'vless' | 'trojan' | 'hysteria2'
  | 'tuic' | 'wireguard' | 'http' | 'socks5' | 'custom'

export const PROXY_PROTOCOLS: ProxyProtocol[] = [
  'ss', 'vmess', 'vless', 'trojan', 'hysteria2',
  'tuic', 'wireguard', 'http', 'socks5', 'custom',
]

// 代理节点表单字段状态
export interface ProxyFormState {
  name: string
  type: ProxyProtocol
  server: string
  port: string
  // ss
  cipher: string
  password: string
  udp: boolean
  // vmess
  uuid: string
  alterId: string
  network: string
  tls: boolean
  // vless
  flow: string
  servername: string
  clientFingerprint: string
  encryption: string
  realityEnabled: boolean
  realityPublicKey: string
  realityShortId: string
  /** Reality 选项中未在普通表单展示的字段。 */
  preservedRealityFields: Record<string, unknown>
  /** 未在普通表单展示的 VLESS 字段，编辑时保留。 */
  preservedFields: Record<string, unknown>
  /** 用于在用户切换 VLESS transport 时清理旧 transport 的嵌套配置。 */
  originalNetwork: string
  // trojan
  sni: string
  skipCertVerify: boolean
  // tuic
  version: string
  // wireguard
  ip: string
  privateKey: string
  publicKey: string
  wgDns: string
  mtu: string
  // http/socks5
  username: string
  // 原始 YAML 编辑
  rawYaml: string
}

export const defaultProxyForm: ProxyFormState = {
  name: '',
  type: 'ss',
  server: '',
  port: '',
  cipher: 'aes-128-gcm',
  password: '',
  udp: false,
  uuid: '',
  alterId: '0',
  network: 'tcp',
  tls: false,
  flow: '',
  servername: '',
  clientFingerprint: '',
  encryption: VLESS_DEFAULT_ENCRYPTION,
  realityEnabled: false,
  realityPublicKey: '',
  realityShortId: '',
  preservedRealityFields: {},
  preservedFields: {},
  originalNetwork: 'tcp',
  sni: '',
  skipCertVerify: false,
  version: '5',
  ip: '',
  privateKey: '',
  publicKey: '',
  wgDns: '',
  mtu: '',
  username: '',
  rawYaml: '',
}

const VLESS_VISIBLE_KEYS = new Set([
  'name',
  'type',
  'server',
  'port',
  'uuid',
  'network',
  'tls',
  'flow',
  'servername',
  'client-fingerprint',
  'encryption',
  'reality-opts',
  '__raw__',
])

const VLESS_TLS_KEYS = [
  'servername',
  'client-fingerprint',
  'skip-cert-verify',
  'alpn',
  'fingerprint',
  'name-cert-verify',
  'certificate',
  'private-key',
  'reality-opts',
  'shadow-tls-opts',
  'restls-opts',
  'jls-opts',
  'ech-opts',
  'tlsmirror-opts',
]

const VLESS_TRANSPORT_KEYS = [
  'ws-opts',
  'http-opts',
  'h2-opts',
  'grpc-opts',
  'xhttp-opts',
  'ws-headers',
]

function preservedVlessFields(node: ProxyNode): Record<string, unknown> {
  const preserved: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if (!VLESS_VISIBLE_KEYS.has(key)) preserved[key] = cloneValue(value)
  }
  return preserved
}

function realityOptions(node: ProxyNode): Record<string, unknown> | null {
  const value = node['reality-opts']
  return isRecord(value) ? value : null
}

function preservedRealityFields(reality: Record<string, unknown> | null): Record<string, unknown> {
  const preserved: Record<string, unknown> = {}
  if (!reality) return preserved
  for (const [key, value] of Object.entries(reality)) {
    if (key !== 'public-key' && key !== 'short-id') preserved[key] = cloneValue(value)
  }
  return preserved
}

/** 将 ProxyNode 对象映射到表单字段 */
export function proxyNodeToForm(node: ProxyNode): ProxyFormState {
  const type = (node.type as ProxyProtocol) || 'ss'
  const reality = type === 'vless' ? realityOptions(node) : null
  return {
    name: node.name || '',
    type,
    server: String(node.server || ''),
    port: String(node.port || ''),
    cipher: String(node.cipher || (type === 'ss' ? 'aes-128-gcm' : 'auto')),
    password: String(node.password || ''),
    udp: Boolean(node.udp),
    uuid: String(node.uuid || ''),
    alterId: String(node.alterId ?? '0'),
    network: String(node.network || 'tcp'),
    tls: Boolean(node.tls),
    flow: String(node.flow || ''),
    servername: String(node.servername || ''),
    clientFingerprint: String(node['client-fingerprint'] || ''),
    encryption: String(node.encryption || VLESS_DEFAULT_ENCRYPTION),
    realityEnabled: Boolean(reality && Object.keys(reality).length > 0),
    realityPublicKey: String(reality?.['public-key'] ?? ''),
    realityShortId: String(reality?.['short-id'] ?? ''),
    preservedRealityFields: type === 'vless' ? preservedRealityFields(reality) : {},
    preservedFields: type === 'vless' ? preservedVlessFields(node) : {},
    originalNetwork: String(node.network || 'tcp'),
    sni: String(node.sni || ''),
    skipCertVerify: Boolean(node['skip-cert-verify']),
    version: String(node.version ?? '5'),
    ip: String(node.ip || ''),
    privateKey: String(node['private-key'] || ''),
    publicKey: String(node['public-key'] || ''),
    wgDns: String(node.dns || ''),
    mtu: String(node.mtu || ''),
    username: String(node.username || ''),
    rawYaml: node.__raw__ ? String(node.__raw__) : proxyToYaml(node as Record<string, unknown>),
  }
}

/** 将表单字段转换为 ProxyNode 对象 */
export function formToProxyNode(form: ProxyFormState): ProxyNode {
  if (form.type === 'custom') {
    return { name: form.name, type: 'custom', __raw__: form.rawYaml }
  }
  const base: Record<string, unknown> = {
    name: form.name,
    type: form.type,
    server: form.server,
    port: parseInt(form.port) || 0,
  }
  if (form.type === 'ss') {
    base.cipher = form.cipher
    base.password = form.password
    if (form.udp) base.udp = true
  } else if (form.type === 'vmess') {
    base.uuid = form.uuid
    base.alterId = parseInt(form.alterId) || 0
    base.cipher = form.cipher
    if (form.tls) base.tls = true
    base.network = form.network
  } else if (form.type === 'vless') {
    const preserved = cloneValue(form.preservedFields)
    if (form.originalNetwork && form.originalNetwork !== form.network) {
      for (const key of VLESS_TRANSPORT_KEYS) delete preserved[key]
    }
    if (!form.tls) {
      for (const key of VLESS_TLS_KEYS) delete preserved[key]
    }
    for (const key of VLESS_VISIBLE_KEYS) delete preserved[key]
    Object.assign(base, preserved)
    base.uuid = form.uuid
    base.tls = Boolean(form.tls)
    base.network = form.network || 'tcp'
    if (form.flow) base.flow = form.flow
    base.encryption = form.encryption || VLESS_DEFAULT_ENCRYPTION
    if (form.tls && form.servername) base.servername = form.servername
    if (form.tls && form.clientFingerprint) base['client-fingerprint'] = form.clientFingerprint
    if (form.tls && form.realityEnabled) {
      const realityOpts = cloneValue(form.preservedRealityFields)
      realityOpts['public-key'] = form.realityPublicKey
      realityOpts['short-id'] = form.realityShortId
      base['reality-opts'] = realityOpts
    }
  } else if (form.type === 'trojan') {
    base.password = form.password
    if (form.sni) base.sni = form.sni
    if (form.skipCertVerify) base['skip-cert-verify'] = true
  } else if (form.type === 'hysteria2') {
    base.password = form.password
    if (form.sni) base.sni = form.sni
    if (form.skipCertVerify) base['skip-cert-verify'] = true
  } else if (form.type === 'tuic') {
    base.uuid = form.uuid
    base.password = form.password
    base.version = parseInt(form.version) || 5
    if (form.sni) base.sni = form.sni
    if (form.skipCertVerify) base['skip-cert-verify'] = true
  } else if (form.type === 'wireguard') {
    base.ip = form.ip
    base['private-key'] = form.privateKey
    base['public-key'] = form.publicKey
    if (form.wgDns) base.dns = form.wgDns
    if (form.mtu) base.mtu = parseInt(form.mtu)
  } else if (form.type === 'http' || form.type === 'socks5') {
    if (form.username) base.username = form.username
    if (form.password) base.password = form.password
    if (form.tls) base.tls = true
  }
  return base as ProxyNode
}

export function validateProxyForm(form: ProxyFormState): VlessUriErrorCode | null {
  if (form.type !== 'vless') return null
  return validateVlessFields({
    uuid: form.uuid,
    server: form.server,
    port: form.port,
    tls: form.tls,
    flow: form.flow,
    encryption: form.encryption,
    clientFingerprint: form.clientFingerprint,
    realityEnabled: form.realityEnabled,
    realityPublicKey: form.realityPublicKey,
    realityShortId: form.realityShortId,
  })
}

/** 生成不冲突的副本名称：`原名 副本`、`原名 副本 2` … */
export function makeUniqueDuplicateProxyName(
  baseName: string,
  copySuffix: string,
  proxies: ProxyNode[],
  proxyGroups: ProxyGroup[]
): string {
  const base = baseName.trim() || 'proxy'
  let candidate = `${base} ${copySuffix}`
  let n = 2
  while (hasProxyOrGroupNameConflict(candidate, proxies, proxyGroups)) {
    candidate = `${base} ${copySuffix} ${n}`
    n++
  }
  return candidate
}

/** 列表快速复制：表单态重建节点并同步自定义 YAML 内名称 */
export function buildDuplicatedProxyNode(proxy: ProxyNode, newName: string): ProxyNode {
  const form = proxyNodeToForm(proxy)
  form.name = newName
  if (form.type === 'custom' && form.rawYaml.trim()) {
    form.rawYaml = replaceProxyYamlNameLine(form.rawYaml, newName)
  }
  return formToProxyNode(form)
}
