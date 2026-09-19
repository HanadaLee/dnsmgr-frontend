import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SaveIcon } from 'lucide-react'

import { apiGet, apiPut } from '@/api/client'
import type { CertificateNotificationMode, CertificateSettings, DataResponse, OperationResult } from '@/api/types'
import { LoadingTable } from '@/components/loading-table'
import { QueryError } from '@/components/query-error'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useApiMutation } from '@/hooks/use-api-mutation'

const modes = [{ value: 'off', label: '关闭' }, { value: 'all', label: '全部通知' }, { value: 'failures-only', label: '仅失败' }]
const channels: Array<[keyof CertificateSettings['notifications'], string]> = [['email', '邮件'], ['wechat', '微信'], ['telegram', 'Telegram'], ['robotWebhook', '群机器人 Webhook'], ['customWebhook', '自定义 Webhook']]

export function CertificateSettingsPage() {
  return <CertificateSettingsPanel />
}

export function CertificateSettingsPanel() {
  const query = useQuery({ queryKey: ['certificate-settings'], queryFn: async () => (await apiGet<DataResponse<CertificateSettings>>('/api/web/v1/certificate-settings')).data })
  const [values, setValues] = useState<CertificateSettings | null>(null)
  useEffect(() => { if (query.data) setValues(query.data) }, [query.data])
  const save = useApiMutation<CertificateSettings, DataResponse<OperationResult>>({ mutationFn: (body) => apiPut('/api/web/v1/certificate-settings', body), successMessage: '证书设置已保存', invalidate: [['certificate-settings']] })
  if (query.isError) return <QueryError error={query.error} retry={() => void query.refetch()} />
  if (!values) return <LoadingTable />

  const updateLocal = (patch: Partial<CertificateSettings['localDeployment']>) => setValues({
    ...values,
    localDeployment: { ...values.localDeployment, ...patch },
  })
  const updateDcv = (patch: Partial<CertificateSettings['dcvDelegation']>) => setValues({
    ...values,
    dcvDelegation: { ...values.dcvDelegation, ...patch },
  })

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); save.mutate(values) }}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>续签与部署</CardTitle><CardDescription>控制证书刷新时间和证书部署允许时段。</CardDescription></CardHeader>
          <CardContent><FieldGroup>
            <Field><FieldLabel htmlFor="renew-days">提前续签天数</FieldLabel><Input id="renew-days" type="number" min={0} max={3650} value={values.renewBeforeDays} onChange={(event) => setValues({ ...values, renewBeforeDays: Number(event.target.value) })} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="start-hour">开始小时</FieldLabel><Input id="start-hour" type="number" min={0} max={23} value={values.deploymentWindow.startHour} onChange={(event) => setValues({ ...values, deploymentWindow: { ...values.deploymentWindow, startHour: Number(event.target.value) } })} /></Field>
              <Field><FieldLabel htmlFor="end-hour">结束小时</FieldLabel><Input id="end-hour" type="number" min={0} max={23} value={values.deploymentWindow.endHour} onChange={(event) => setValues({ ...values, deploymentWindow: { ...values.deploymentWindow, endHour: Number(event.target.value) } })} /></Field>
            </div>
          </FieldGroup></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>通知策略</CardTitle><CardDescription>针对证书签发和部署结果选择通知范围。</CardDescription></CardHeader>
          <CardContent><FieldGroup>{channels.map(([key, label]) => <Field key={key}><FieldLabel>{label}</FieldLabel><Select items={modes} value={values.notifications[key]} onValueChange={(value) => setValues({ ...values, notifications: { ...values.notifications, [key]: value as CertificateNotificationMode } })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{modes.map((mode) => <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>)}</FieldGroup></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>复制到本机</CardTitle><CardDescription>使用路径模板快速生成本机证书部署配置。</CardDescription></CardHeader>
          <CardContent><FieldGroup>
            <Field><FieldLabel>默认配置模式</FieldLabel><Select items={[{ value: 'quick', label: '快速模式' }, { value: 'custom', label: '自定义模式' }]} value={values.localDeployment.defaultMode} onValueChange={(value) => updateLocal({ defaultMode: (value ?? 'quick') as 'quick' | 'custom' })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="quick">快速模式</SelectItem><SelectItem value="custom">自定义模式</SelectItem></SelectGroup></SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="pem-cert-template">证书保存路径模板</FieldLabel><Input id="pem-cert-template" value={values.localDeployment.pemCertificatePathTemplate} onChange={(event) => updateLocal({ pemCertificatePathTemplate: event.target.value })} /></Field>
            <Field><FieldLabel htmlFor="pem-key-template">私钥保存路径模板</FieldLabel><Input id="pem-key-template" value={values.localDeployment.pemPrivateKeyPathTemplate} onChange={(event) => updateLocal({ pemPrivateKeyPathTemplate: event.target.value })} /></Field>
            <Field><FieldLabel htmlFor="pfx-template">PFX 保存路径模板</FieldLabel><Input id="pfx-template" value={values.localDeployment.pfxPathTemplate} onChange={(event) => updateLocal({ pfxPathTemplate: event.target.value })} /></Field>
            <Field><FieldLabel htmlFor="command-template">部署后命令模板</FieldLabel><Textarea id="command-template" value={values.localDeployment.commandTemplate} onChange={(event) => updateLocal({ commandTemplate: event.target.value })} /><FieldDescription>支持 {'{domain}'}、{'{domainWithDashes}'} 和 {'{orderId}'}。</FieldDescription></Field>
          </FieldGroup></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>DCV 托管策略</CardTitle><CardDescription>限制可添加的证书域名，并设置默认目标记录拼接模板。</CardDescription></CardHeader>
          <CardContent><FieldGroup>
            <Field><FieldLabel htmlFor="dcv-domains">允许托管的域名</FieldLabel><Textarea id="dcv-domains" value={values.dcvDelegation.allowedDomains.join('\n')} placeholder={'example.com\nexample.net'} onChange={(event) => updateDcv({ allowedDomains: event.target.value.split(/[\r\n,]+/).map((item) => item.trim()).filter(Boolean) })} /><FieldDescription>每行一个；留空表示不限制。</FieldDescription></Field>
            <Field><FieldLabel>域名匹配方式</FieldLabel><Select items={[{ value: 'suffix', label: '域名及其子域名' }, { value: 'exact', label: '仅完全匹配' }]} value={values.dcvDelegation.domainMatchMode} onValueChange={(value) => updateDcv({ domainMatchMode: (value ?? 'suffix') as 'exact' | 'suffix' })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="suffix">域名及其子域名</SelectItem><SelectItem value="exact">仅完全匹配</SelectItem></SelectGroup></SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="dcv-record-template">默认目标记录模板</FieldLabel><Input id="dcv-record-template" value={values.dcvDelegation.targetRecordNameTemplate} onChange={(event) => updateDcv({ targetRecordNameTemplate: event.target.value })} /><FieldDescription>支持 {'{domain}'} 和 {'{domainWithDashes}'}。</FieldDescription></Field>
            <Field orientation="horizontal"><FieldLabel htmlFor="force-dcv-template">强制使用目标记录模板</FieldLabel><Switch id="force-dcv-template" checked={values.dcvDelegation.forceTargetRecordNameTemplate} onCheckedChange={(checked) => updateDcv({ forceTargetRecordNameTemplate: checked })} /></Field>
          </FieldGroup></CardContent>
        </Card>
      </div>
      <Button className="self-start" type="submit" disabled={save.isPending}>{save.isPending ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}保存证书设置</Button>
    </form>
  )
}
