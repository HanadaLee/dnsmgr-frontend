import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SaveIcon } from 'lucide-react'

import { apiGet, apiPut } from '@/api/client'
import type { CertificateNotificationMode, CertificateSettings, DataResponse, OperationResult } from '@/api/types'
import { LoadingTable } from '@/components/loading-table'
import { QueryError } from '@/components/query-error'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
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
  return <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); save.mutate(values) }}><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>续签与部署</CardTitle><CardDescription>控制证书刷新时间和自动部署允许时段。</CardDescription></CardHeader><CardContent><FieldGroup><Field><FieldLabel htmlFor="renew-days">提前续签天数</FieldLabel><Input id="renew-days" type="number" min={0} max={3650} value={values.renewBeforeDays} onChange={(event) => setValues({ ...values, renewBeforeDays: Number(event.target.value) })} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="start-hour">开始小时</FieldLabel><Input id="start-hour" type="number" min={0} max={23} value={values.deploymentWindow.startHour} onChange={(event) => setValues({ ...values, deploymentWindow: { ...values.deploymentWindow, startHour: Number(event.target.value) } })} /></Field><Field><FieldLabel htmlFor="end-hour">结束小时</FieldLabel><Input id="end-hour" type="number" min={0} max={23} value={values.deploymentWindow.endHour} onChange={(event) => setValues({ ...values, deploymentWindow: { ...values.deploymentWindow, endHour: Number(event.target.value) } })} /></Field></div></FieldGroup></CardContent></Card><Card><CardHeader><CardTitle>通知策略</CardTitle><CardDescription>针对证书签发和部署结果选择通知范围。</CardDescription></CardHeader><CardContent><FieldGroup>{channels.map(([key, label]) => <Field key={key}><FieldLabel>{label}</FieldLabel><Select items={modes} value={values.notifications[key]} onValueChange={(value) => setValues({ ...values, notifications: { ...values.notifications, [key]: value as CertificateNotificationMode } })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{modes.map((mode) => <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>)}</FieldGroup></CardContent></Card></div><Button className="self-start" type="submit" disabled={save.isPending}>{save.isPending ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}保存证书设置</Button></form>
}
