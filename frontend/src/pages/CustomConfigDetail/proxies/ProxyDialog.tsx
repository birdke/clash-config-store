import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { ProxyNode } from '@/types'
import { ProxyPasswordInput } from '@/components/ProxyPasswordInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select'
import {
  type ProxyFormState,
  type ProxyProtocol,
  PROXY_PROTOCOLS,
  defaultProxyForm,
  proxyNodeToForm,
  formToProxyNode,
  proxyToYaml,
  yamlToProxy,
  validateProxyForm,
} from './proxy-form'
import {
  getVlessUriErrorCode,
  parseVlessUri,
  SUPPORTED_VLESS_CLIENT_FINGERPRINTS,
  VLESS_DEFAULT_ENCRYPTION,
} from './vless-uri'
import type { VlessUriErrorCode } from './vless-uri'

// ─────────────────────────────────────────────
// 内部组件：代理节点编辑弹窗
// ─────────────────────────────────────────────

export interface ProxyDialogProps {
  open: boolean
  initialNode: ProxyNode | null  // null = 新建
  onClose: () => void
  onSave: (node: ProxyNode) => void
}

export function ProxyDialog({ open, initialNode, onClose, onSave }: ProxyDialogProps) {
  const { t } = useTranslation()
  const [form, setForm] = useState<ProxyFormState>(defaultProxyForm)
  // 是否显示 YAML 编辑模式
  const [yamlMode, setYamlMode] = useState(false)
  // 添加节点时的本地 VLESS URI 草稿；不写入存储或日志
  const [vlessUri, setVlessUri] = useState('')
  const [vlessUriError, setVlessUriError] = useState<VlessUriErrorCode | null>(null)

  // 打开/初始化时重置表单
  useEffect(() => {
    if (open) {
      if (initialNode) {
        setForm(proxyNodeToForm(initialNode))
        setYamlMode(initialNode.type === 'custom')
      } else {
        setForm({ ...defaultProxyForm, preservedFields: {} })
        setYamlMode(false)
      }
      setVlessUri('')
      setVlessUriError(null)
    } else {
      setVlessUri('')
      setVlessUriError(null)
    }
  }, [open, initialNode])

  const set = <K extends keyof ProxyFormState>(key: K, val: ProxyFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  const changeProxyType = (type: ProxyProtocol) => {
    setForm((prev) => {
      if (type === prev.type) return prev
      if (type === 'vless') {
        return {
          ...prev,
          type,
          preservedRealityFields: {},
          preservedFields: {},
          originalNetwork: 'tcp',
          encryption: VLESS_DEFAULT_ENCRYPTION,
          realityEnabled: false,
          realityPublicKey: '',
          realityShortId: '',
        }
      }
      return {
        ...prev,
        type,
        preservedRealityFields: {},
        preservedFields: {},
        realityEnabled: false,
        realityPublicKey: '',
        realityShortId: '',
      }
    })
    if (type === 'custom') setYamlMode(true)
  }

  const parsePastedVlessUri = () => {
    try {
      const node = parseVlessUri(vlessUri)
      setForm(proxyNodeToForm(node))
      setYamlMode(false)
      setVlessUriError(null)
      toast.success(t('customConfigs.vlessUriParsed'))
    } catch (error) {
      const code = getVlessUriErrorCode(error)
      setVlessUriError(code)
      toast.error(t(`customConfigs.vlessUriErrors.${code}`))
    }
  }

  // 切换到 YAML 模式：先把当前表单序列化
  const switchToYaml = () => {
    const node = formToProxyNode(form)
    const yaml =
      form.type === 'custom'
        ? form.rawYaml
        : proxyToYaml(node as Record<string, unknown>)
    setForm((prev) => ({ ...prev, rawYaml: yaml }))
    setYamlMode(true)
  }

  // 切换回表单模式：解析 YAML
  const switchToForm = () => {
    try {
      const parsed = yamlToProxy(form.rawYaml)
      const parsedType = parsed.type as string
      if (!PROXY_PROTOCOLS.includes(parsedType as ProxyProtocol)) {
        toast.error(t('customConfigs.yamlUnsupportedType'))
        return
      }
      const newType = parsedType as ProxyProtocol
      const reconstructed: ProxyNode = { name: form.name, type: newType, ...parsed }
      setForm(proxyNodeToForm(reconstructed))
    } catch {
      toast.error(t('customConfigs.yamlParseError'))
      return
    }
    setYamlMode(false)
  }

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error(t('customConfigs.proxyName') + ' ' + t('common.required'))
      return
    }
    if (!yamlMode) {
      const vlessValidationError = validateProxyForm(form)
      if (vlessValidationError) {
        toast.error(t(`customConfigs.vlessUriErrors.${vlessValidationError}`))
        return
      }
    }
    let node: ProxyNode
    if (yamlMode) {
      // YAML 模式下直接解析
      try {
        const parsed = yamlToProxy(form.rawYaml)
        node = {
          name: form.name,
          type: parsed.type as string,
          ...parsed,
        }
      } catch {
        toast.error(t('customConfigs.yamlParseError'))
        return
      }
    } else {
      node = formToProxyNode(form)
    }
    onSave(node)
  }

  // 根据协议类型渲染特定字段
  const renderTypeFields = () => {
    const type = form.type
    if (type === 'custom') {
      return (
        <div className="space-y-2">
          <Label>{t('customConfigs.rawYaml')}</Label>
          <Textarea
            className="font-mono text-sm min-h-[200px]"
            value={form.rawYaml}
            onChange={(e) => set('rawYaml', e.target.value)}
            placeholder="# 完整代理节点 YAML"
          />
        </div>
      )
    }

    const commonFields = (
      <>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>{t('customConfigs.proxyServer')}</Label>
            <Input value={form.server} onChange={(e) => set('server', e.target.value)} placeholder="1.2.3.4" />
          </div>
          <div className="space-y-1">
            <Label>{t('customConfigs.proxyPort')}</Label>
            <Input type="number" value={form.port} onChange={(e) => set('port', e.target.value)} placeholder="443" />
          </div>
        </div>
      </>
    )

    if (type === 'ss') {
      return (
        <>
          {commonFields}
          <div className="space-y-1">
            <Label>Cipher</Label>
            <NativeSelect value={form.cipher} onChange={(e) => set('cipher', e.target.value)}>
              {['aes-128-gcm', 'aes-256-gcm', 'chacha20-ietf-poly1305'].map((c) => (
                <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label>Password</Label>
            <ProxyPasswordInput
              key="ss"
              inputName="proxy-ss-password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="ss-udp" checked={form.udp} onCheckedChange={(v) => set('udp', !!v)} />
            <label htmlFor="ss-udp" className="text-sm cursor-pointer">UDP</label>
          </div>
        </>
      )
    }

    if (type === 'vmess') {
      return (
        <>
          {commonFields}
          <div className="space-y-1">
            <Label>UUID</Label>
            <Input value={form.uuid} onChange={(e) => set('uuid', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Alter ID</Label>
              <Input type="number" value={form.alterId} onChange={(e) => set('alterId', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Cipher</Label>
              <NativeSelect value={form.cipher} onChange={(e) => set('cipher', e.target.value)}>
                {['auto', 'aes-128-gcm', 'chacha20-poly1305', 'none'].map((c) => (
                  <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Network</Label>
              <NativeSelect value={form.network} onChange={(e) => set('network', e.target.value)}>
                {['tcp', 'ws', 'http', 'h2', 'grpc'].map((n) => (
                  <NativeSelectOption key={n} value={n}>{n}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox id="vmess-tls" checked={form.tls} onCheckedChange={(v) => set('tls', !!v)} />
              <label htmlFor="vmess-tls" className="text-sm cursor-pointer">TLS</label>
            </div>
          </div>
        </>
      )
    }

    if (type === 'vless') {
      const fingerprintOptions = form.clientFingerprint &&
        !(SUPPORTED_VLESS_CLIENT_FINGERPRINTS as readonly string[]).includes(form.clientFingerprint)
        ? [form.clientFingerprint, ...SUPPORTED_VLESS_CLIENT_FINGERPRINTS]
        : SUPPORTED_VLESS_CLIENT_FINGERPRINTS
      return (
        <>
          {commonFields}
          <div className="space-y-1">
            <Label>UUID</Label>
            <Input value={form.uuid} onChange={(e) => set('uuid', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Network</Label>
              <NativeSelect value={form.network} onChange={(e) => set('network', e.target.value)}>
                {['tcp', 'ws', 'http', 'grpc'].map((n) => (
                  <NativeSelectOption key={n} value={n}>{n}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox
                id="vless-tls"
                checked={form.tls}
                onCheckedChange={(v) => {
                  const enabled = !!v
                  setForm((prev) => ({
                    ...prev,
                    tls: enabled,
                    ...(enabled
                      ? {}
                      : {
                          servername: '',
                          clientFingerprint: '',
                          realityEnabled: false,
                          realityPublicKey: '',
                          realityShortId: '',
                        }),
                  }))
                }}
              />
              <label htmlFor="vless-tls" className="text-sm cursor-pointer">TLS</label>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Flow <span className="text-xs text-muted-foreground">({t('common.optional')})</span></Label>
            <Input value={form.flow} onChange={(e) => set('flow', e.target.value)} placeholder="xtls-rprx-vision" />
          </div>
          <div className="space-y-1">
            <Label>{t('customConfigs.vlessEncryption')}</Label>
            <NativeSelect value={form.encryption} onChange={(e) => set('encryption', e.target.value)}>
              {form.encryption !== VLESS_DEFAULT_ENCRYPTION && (
                <NativeSelectOption value={form.encryption}>{form.encryption}</NativeSelectOption>
              )}
              <NativeSelectOption value={VLESS_DEFAULT_ENCRYPTION}>{VLESS_DEFAULT_ENCRYPTION}</NativeSelectOption>
            </NativeSelect>
          </div>
          {(form.tls || form.realityEnabled) && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('customConfigs.vlessServername')} <span className="text-xs text-muted-foreground">({t('common.optional')})</span></Label>
                  <Input value={form.servername} onChange={(e) => set('servername', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t('customConfigs.vlessClientFingerprint')} <span className="text-xs text-muted-foreground">({t('common.optional')})</span></Label>
                  <NativeSelect value={form.clientFingerprint} onChange={(e) => set('clientFingerprint', e.target.value)}>
                    <NativeSelectOption value="">{t('common.optional')}</NativeSelectOption>
                    {fingerprintOptions.map((fingerprint) => (
                      <NativeSelectOption key={fingerprint} value={fingerprint}>{fingerprint}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="vless-reality"
                  checked={form.realityEnabled}
                  onCheckedChange={(v) => {
                    const enabled = !!v
                    setForm((prev) => ({
                      ...prev,
                      realityEnabled: enabled,
                      ...(enabled ? {} : { realityPublicKey: '', realityShortId: '' }),
                    }))
                  }}
                />
                <label htmlFor="vless-reality" className="text-sm cursor-pointer">
                  {t('customConfigs.vlessReality')}
                </label>
              </div>
              {form.realityEnabled && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{t('customConfigs.vlessRealityPublicKey')}</Label>
                    <Input
                      value={form.realityPublicKey}
                      onChange={(e) => set('realityPublicKey', e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('customConfigs.vlessRealityShortId')}</Label>
                    <Input
                      value={form.realityShortId}
                      onChange={(e) => set('realityShortId', e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )
    }

    if (type === 'trojan') {
      return (
        <>
          {commonFields}
          <div className="space-y-1">
            <Label>Password</Label>
            <ProxyPasswordInput
              key="trojan"
              inputName="proxy-trojan-password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>SNI <span className="text-xs text-muted-foreground">({t('common.optional')})</span></Label>
            <Input value={form.sni} onChange={(e) => set('sni', e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="trojan-skip" checked={form.skipCertVerify} onCheckedChange={(v) => set('skipCertVerify', !!v)} />
            <label htmlFor="trojan-skip" className="text-sm cursor-pointer">skip-cert-verify</label>
          </div>
        </>
      )
    }

    if (type === 'hysteria2') {
      return (
        <>
          {commonFields}
          <div className="space-y-1">
            <Label>Password</Label>
            <ProxyPasswordInput
              key="hysteria2"
              inputName="proxy-hysteria2-password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>SNI <span className="text-xs text-muted-foreground">({t('common.optional')})</span></Label>
            <Input value={form.sni} onChange={(e) => set('sni', e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="hy2-skip" checked={form.skipCertVerify} onCheckedChange={(v) => set('skipCertVerify', !!v)} />
            <label htmlFor="hy2-skip" className="text-sm cursor-pointer">skip-cert-verify</label>
          </div>
        </>
      )
    }

    if (type === 'tuic') {
      return (
        <>
          {commonFields}
          <div className="space-y-1">
            <Label>UUID</Label>
            <Input value={form.uuid} onChange={(e) => set('uuid', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Password</Label>
            <ProxyPasswordInput
              key="tuic"
              inputName="proxy-tuic-password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Version</Label>
              <Input type="number" value={form.version} onChange={(e) => set('version', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>SNI <span className="text-xs text-muted-foreground">({t('common.optional')})</span></Label>
              <Input value={form.sni} onChange={(e) => set('sni', e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="tuic-skip" checked={form.skipCertVerify} onCheckedChange={(v) => set('skipCertVerify', !!v)} />
            <label htmlFor="tuic-skip" className="text-sm cursor-pointer">skip-cert-verify</label>
          </div>
        </>
      )
    }

    if (type === 'wireguard') {
      return (
        <>
          {commonFields}
          <div className="space-y-1">
            <Label>Local IP</Label>
            <Input value={form.ip} onChange={(e) => set('ip', e.target.value)} placeholder="10.0.0.2/32" />
          </div>
          <div className="space-y-1">
            <Label>Private Key</Label>
            <Input value={form.privateKey} onChange={(e) => set('privateKey', e.target.value)} className="font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <Label>Public Key</Label>
            <Input value={form.publicKey} onChange={(e) => set('publicKey', e.target.value)} className="font-mono text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>DNS <span className="text-xs text-muted-foreground">({t('common.optional')})</span></Label>
              <Input value={form.wgDns} onChange={(e) => set('wgDns', e.target.value)} placeholder="1.1.1.1" />
            </div>
            <div className="space-y-1">
              <Label>MTU <span className="text-xs text-muted-foreground">({t('common.optional')})</span></Label>
              <Input type="number" value={form.mtu} onChange={(e) => set('mtu', e.target.value)} placeholder="1420" />
            </div>
          </div>
        </>
      )
    }

    if (type === 'http' || type === 'socks5') {
      return (
        <>
          {commonFields}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Username <span className="text-xs text-muted-foreground">({t('common.optional')})</span></Label>
              <Input value={form.username} onChange={(e) => set('username', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Password <span className="text-xs text-muted-foreground">({t('common.optional')})</span></Label>
              <ProxyPasswordInput
                key="http-socks"
                inputName="proxy-http-socks-password"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="http-tls" checked={form.tls} onCheckedChange={(v) => set('tls', !!v)} />
            <label htmlFor="http-tls" className="text-sm cursor-pointer">TLS</label>
          </div>
        </>
      )
    }

    return null
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            handleSave()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {initialNode ? t('customConfigs.editProxy') : t('customConfigs.addProxy')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
          {/* 节点名称（始终显示） */}
          <div className="space-y-1">
            <Label>{t('customConfigs.proxyName')}</Label>
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="my-proxy"
            />
          </div>

          {!initialNode && (
            <div className="space-y-2 rounded-md border border-dashed p-3">
              <Label>{t('customConfigs.vlessUriLabel')}</Label>
              <Textarea
                value={vlessUri}
                onChange={(e) => {
                  setVlessUri(e.target.value)
                  if (vlessUriError) setVlessUriError(null)
                }}
                placeholder="vless://uuid@example.com:443?..."
                className="font-mono text-xs min-h-[84px]"
                aria-label={t('customConfigs.vlessUriLabel')}
              />
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={parsePastedVlessUri}>
                  {t('customConfigs.parseVlessUri')}
                </Button>
                <span className="text-xs text-muted-foreground">{t('customConfigs.vlessUriLocalOnly')}</span>
              </div>
              {vlessUriError && (
                <p role="alert" className="text-sm text-destructive">
                  {t(`customConfigs.vlessUriErrors.${vlessUriError}`)}
                </p>
              )}
            </div>
          )}

          {/* 协议类型（YAML 模式下仍可见） */}
          {!yamlMode && (
            <div className="space-y-1">
              <Label>{t('customConfigs.proxyType')}</Label>
              <NativeSelect
                value={form.type}
                onChange={(e) => {
                  const v = e.target.value as ProxyProtocol
                  changeProxyType(v)
                }}
              >
                {PROXY_PROTOCOLS.map((p) => (
                  <NativeSelectOption key={p} value={p}>{p}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}

          {/* 主体内容：表单字段 或 YAML 编辑器 */}
          {yamlMode ? (
            <div className="space-y-2">
              <Label>{t('customConfigs.rawYaml')}</Label>
              <Textarea
                className="font-mono text-sm min-h-[240px]"
                value={form.rawYaml}
                onChange={(e) => set('rawYaml', e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-3">{renderTypeFields()}</div>
          )}
        </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {/* 切换按钮 */}
            {form.type !== 'custom' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mr-auto"
                onClick={yamlMode ? switchToForm : switchToYaml}
              >
                {yamlMode ? t('customConfigs.switchToForm') : t('customConfigs.switchToYaml')}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit">{t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
