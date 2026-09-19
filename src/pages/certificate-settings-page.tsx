import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PlusIcon, SaveIcon, Trash2Icon } from 'lucide-react'

import { apiGet, apiPut } from '@/api/client'
import type {
  CertificateDcvDelegationTemplate,
  CertificateLocalDeploymentTemplate,
  CertificateNotificationMode,
  CertificateSettings,
  DataResponse,
  OperationResult,
} from '@/api/types'
import { ConfirmAction } from '@/components/confirm-action'
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

type CnameForm = { domains: Array<{ id: number; name: string }> }

const notificationModes = [
  { value: 'off', label: '关闭' },
  { value: 'all', label: '全部通知' },
  { value: 'failures-only', label: '仅失败' },
]
const notificationChannels: Array<[keyof CertificateSettings['notifications'], string]> = [
  ['email', '邮件'],
  ['wechat', '微信'],
  ['telegram', 'Telegram'],
  ['robotWebhook', '群机器人 Webhook'],
  ['customWebhook', '自定义 Webhook'],
]

function newTemplateId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
}

function uniqueTemplateName(prefix: string, names: string[]) {
  let index = names.length + 1
  while (names.includes(`${prefix} ${index}`)) index += 1
  return `${prefix} ${index}`
}

export function CertificateSettingsPage() {
  return <CertificateSettingsPanel />
}

export function CertificateSettingsPanel() {
  const query = useQuery({
    queryKey: ['certificate-settings'],
    queryFn: async () => (await apiGet<DataResponse<CertificateSettings>>('/api/web/v1/certificate-settings')).data,
  })
  const cnameForm = useQuery({
    queryKey: ['certificate-cnames-form'],
    queryFn: async () => (await apiGet<DataResponse<CnameForm>>('/api/web/v1/certificate-cnames/form')).data,
  })
  const [values, setValues] = useState<CertificateSettings | null>(null)
  const [selectedLocalTemplateId, setSelectedLocalTemplateId] = useState('')
  const [selectedDcvTemplateId, setSelectedDcvTemplateId] = useState('')
  useEffect(() => {
    if (!query.data) return
    setValues(query.data)
    setSelectedLocalTemplateId(query.data.localDeployment.defaultTemplateId)
    setSelectedDcvTemplateId(query.data.dcvDelegation.defaultTemplateId)
  }, [query.data])
  const save = useApiMutation<CertificateSettings, DataResponse<OperationResult>>({
    mutationFn: (body) => apiPut('/api/web/v1/certificate-settings', body),
    successMessage: '证书设置已保存',
    invalidate: [['certificate-settings']],
  })

  if (query.isError) return <QueryError error={query.error} retry={() => void query.refetch()} />
  if (!values) return <LoadingTable />

  const selectedLocalTemplate = values.localDeployment.templates.find(
    (template) => template.id === selectedLocalTemplateId,
  ) ?? values.localDeployment.templates[0]
  const selectedDcvTemplate = values.dcvDelegation.templates.find(
    (template) => template.id === selectedDcvTemplateId,
  ) ?? values.dcvDelegation.templates[0]
  const targetDomainOptions = (cnameForm.data?.domains ?? []).map((domain) => ({
    value: String(domain.id),
    label: domain.name,
  }))

  const updateLocal = (patch: Partial<CertificateSettings['localDeployment']>) => {
    setValues((current) => current ? {
      ...current,
      localDeployment: { ...current.localDeployment, ...patch },
    } : current)
  }
  const updateDcv = (patch: Partial<CertificateSettings['dcvDelegation']>) => {
    setValues((current) => current ? {
      ...current,
      dcvDelegation: { ...current.dcvDelegation, ...patch },
    } : current)
  }
  const updateLocalTemplate = (patch: Partial<CertificateLocalDeploymentTemplate>) => {
    setValues((current) => current ? {
      ...current,
      localDeployment: {
        ...current.localDeployment,
        templates: current.localDeployment.templates.map((template) => (
          template.id === selectedLocalTemplateId ? { ...template, ...patch } : template
        )),
      },
    } : current)
  }
  const updateDcvTemplate = (patch: Partial<CertificateDcvDelegationTemplate>) => {
    setValues((current) => current ? {
      ...current,
      dcvDelegation: {
        ...current.dcvDelegation,
        templates: current.dcvDelegation.templates.map((template) => (
          template.id === selectedDcvTemplateId ? { ...template, ...patch } : template
        )),
      },
    } : current)
  }
  const addLocalTemplate = () => {
    const id = newTemplateId('local')
    setValues((current) => {
      if (!current) return current
      const source = current.localDeployment.templates.find(
        (template) => template.id === selectedLocalTemplateId,
      ) ?? current.localDeployment.templates[0]
      if (!source) return current
      return {
        ...current,
        localDeployment: {
          ...current.localDeployment,
          templates: [...current.localDeployment.templates, {
            ...source,
            id,
            name: uniqueTemplateName(
              '模板',
              current.localDeployment.templates.map((template) => template.name),
            ),
          }],
        },
      }
    })
    setSelectedLocalTemplateId(id)
  }
  const addDcvTemplate = () => {
    const id = newTemplateId('dcv')
    setValues((current) => {
      if (!current) return current
      const source = current.dcvDelegation.templates.find(
        (template) => template.id === selectedDcvTemplateId,
      ) ?? current.dcvDelegation.templates[0]
      if (!source) return current
      return {
        ...current,
        dcvDelegation: {
          ...current.dcvDelegation,
          templates: [...current.dcvDelegation.templates, {
            ...source,
            id,
            name: uniqueTemplateName(
              '模板',
              current.dcvDelegation.templates.map((template) => template.name),
            ),
          }],
        },
      }
    })
    setSelectedDcvTemplateId(id)
  }
  const removeLocalTemplate = () => {
    const nextTemplate = values.localDeployment.templates.find(
      (template) => template.id !== selectedLocalTemplateId,
    )
    if (!nextTemplate) return
    setValues((current) => current ? {
      ...current,
      localDeployment: {
        ...current.localDeployment,
        defaultTemplateId: current.localDeployment.defaultTemplateId === selectedLocalTemplateId
          ? nextTemplate.id
          : current.localDeployment.defaultTemplateId,
        templates: current.localDeployment.templates.filter(
          (template) => template.id !== selectedLocalTemplateId,
        ),
      },
    } : current)
    setSelectedLocalTemplateId(nextTemplate.id)
  }
  const removeDcvTemplate = () => {
    const nextTemplate = values.dcvDelegation.templates.find(
      (template) => template.id !== selectedDcvTemplateId,
    )
    if (!nextTemplate) return
    setValues((current) => current ? {
      ...current,
      dcvDelegation: {
        ...current.dcvDelegation,
        defaultTemplateId: current.dcvDelegation.defaultTemplateId === selectedDcvTemplateId
          ? nextTemplate.id
          : current.dcvDelegation.defaultTemplateId,
        templates: current.dcvDelegation.templates.filter(
          (template) => template.id !== selectedDcvTemplateId,
        ),
      },
    } : current)
    setSelectedDcvTemplateId(nextTemplate.id)
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate(values)
      }}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>续签与部署</CardTitle>
            <CardDescription>控制证书刷新时间和证书部署允许时段。</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="renew-days">提前续签天数</FieldLabel>
                <Input
                  id="renew-days"
                  type="number"
                  min={0}
                  max={3650}
                  value={values.renewBeforeDays}
                  onChange={(event) => setValues((current) => current ? {
                    ...current,
                    renewBeforeDays: Number(event.target.value),
                  } : current)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="start-hour">开始小时</FieldLabel>
                  <Input
                    id="start-hour"
                    type="number"
                    min={0}
                    max={23}
                    value={values.deploymentWindow.startHour}
                    onChange={(event) => setValues((current) => current ? {
                      ...current,
                      deploymentWindow: {
                        ...current.deploymentWindow,
                        startHour: Number(event.target.value),
                      },
                    } : current)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="end-hour">结束小时</FieldLabel>
                  <Input
                    id="end-hour"
                    type="number"
                    min={0}
                    max={23}
                    value={values.deploymentWindow.endHour}
                    onChange={(event) => setValues((current) => current ? {
                      ...current,
                      deploymentWindow: {
                        ...current.deploymentWindow,
                        endHour: Number(event.target.value),
                      },
                    } : current)}
                  />
                </Field>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>通知策略</CardTitle>
            <CardDescription>针对证书签发和部署结果选择通知范围。</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              {notificationChannels.map(([key, label]) => (
                <Field key={key}>
                  <FieldLabel>{label}</FieldLabel>
                  <Select
                    items={notificationModes}
                    value={values.notifications[key]}
                    onValueChange={(value) => setValues((current) => current ? {
                      ...current,
                      notifications: {
                        ...current.notifications,
                        [key]: value as CertificateNotificationMode,
                      },
                    } : current)}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {notificationModes.map((mode) => (
                          <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              ))}
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>复制到本机</CardTitle>
            <CardDescription>管理多套路径和部署命令模板。</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>当前模板</FieldLabel>
                <div className="flex items-center gap-2">
                  <Select
                    items={values.localDeployment.templates.map((template) => ({ value: template.id, label: template.name }))}
                    value={selectedLocalTemplate?.id ?? null}
                    onValueChange={(value) => setSelectedLocalTemplateId(value ?? '')}
                  >
                    <SelectTrigger className="min-w-0 flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {values.localDeployment.templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" aria-label="添加本机部署模板" disabled={values.localDeployment.templates.length >= 20} onClick={addLocalTemplate}>
                    <PlusIcon />
                  </Button>
                  <ConfirmAction
                    trigger={
                      <Button type="button" variant="outline" size="icon" aria-label="删除当前本机部署模板" disabled={values.localDeployment.templates.length === 1}>
                        <Trash2Icon />
                      </Button>
                    }
                    title="删除本机部署模板？"
                    description={selectedLocalTemplate?.name ?? ''}
                    destructive
                    onConfirm={removeLocalTemplate}
                  />
                </div>
              </Field>
              {selectedLocalTemplate ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="local-template-name">模板名称</FieldLabel>
                    <Input id="local-template-name" value={selectedLocalTemplate.name} maxLength={64} required onChange={(event) => updateLocalTemplate({ name: event.target.value })} />
                  </Field>
                  <Field orientation="horizontal">
                    <FieldLabel htmlFor="local-template-default">设为默认模板</FieldLabel>
                    <Switch id="local-template-default" checked={values.localDeployment.defaultTemplateId === selectedLocalTemplate.id} onCheckedChange={(checked) => { if (checked) updateLocal({ defaultTemplateId: selectedLocalTemplate.id }) }} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="pem-cert-template">证书保存路径模板</FieldLabel>
                    <Input id="pem-cert-template" value={selectedLocalTemplate.pemCertificatePathTemplate} required onChange={(event) => updateLocalTemplate({ pemCertificatePathTemplate: event.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="pem-key-template">私钥保存路径模板</FieldLabel>
                    <Input id="pem-key-template" value={selectedLocalTemplate.pemPrivateKeyPathTemplate} required onChange={(event) => updateLocalTemplate({ pemPrivateKeyPathTemplate: event.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="pfx-template">PFX 保存路径模板</FieldLabel>
                    <Input id="pfx-template" value={selectedLocalTemplate.pfxPathTemplate} required onChange={(event) => updateLocalTemplate({ pfxPathTemplate: event.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="command-template">部署后命令模板</FieldLabel>
                    <Textarea id="command-template" value={selectedLocalTemplate.commandTemplate} onChange={(event) => updateLocalTemplate({ commandTemplate: event.target.value })} />
                    <FieldDescription>支持 {'{domain}'}、{'{domainWithDashes}'} 和 {'{orderId}'}。</FieldDescription>
                  </Field>
                </>
              ) : null}
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>DCV 托管模板</CardTitle>
            <CardDescription>预先选择 CNAME 目标域名和主机记录规则；使用模板创建时只需填写证书域名。</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>当前模板</FieldLabel>
                <div className="flex items-center gap-2">
                  <Select
                    items={values.dcvDelegation.templates.map((template) => ({ value: template.id, label: template.name }))}
                    value={selectedDcvTemplate?.id ?? null}
                    onValueChange={(value) => setSelectedDcvTemplateId(value ?? '')}
                  >
                    <SelectTrigger className="min-w-0 flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {values.dcvDelegation.templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" aria-label="添加 DCV 托管模板" disabled={values.dcvDelegation.templates.length >= 20} onClick={addDcvTemplate}>
                    <PlusIcon />
                  </Button>
                  <ConfirmAction
                    trigger={
                      <Button type="button" variant="outline" size="icon" aria-label="删除当前 DCV 托管模板" disabled={values.dcvDelegation.templates.length === 1}>
                        <Trash2Icon />
                      </Button>
                    }
                    title="删除 DCV 托管模板？"
                    description={selectedDcvTemplate?.name ?? ''}
                    destructive
                    onConfirm={removeDcvTemplate}
                  />
                </div>
              </Field>
              {selectedDcvTemplate ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="dcv-template-name">模板名称</FieldLabel>
                    <Input id="dcv-template-name" value={selectedDcvTemplate.name} maxLength={64} required onChange={(event) => updateDcvTemplate({ name: event.target.value })} />
                  </Field>
                  <Field orientation="horizontal">
                    <FieldLabel htmlFor="dcv-template-default">设为默认模板</FieldLabel>
                    <Switch id="dcv-template-default" checked={values.dcvDelegation.defaultTemplateId === selectedDcvTemplate.id} onCheckedChange={(checked) => { if (checked) updateDcv({ defaultTemplateId: selectedDcvTemplate.id }) }} />
                  </Field>
                  <Field>
                    <FieldLabel>CNAME 目标域名</FieldLabel>
                    <Select
                      items={targetDomainOptions}
                      value={selectedDcvTemplate.targetDomainId ? String(selectedDcvTemplate.targetDomainId) : null}
                      onValueChange={(value) => updateDcvTemplate({ targetDomainId: value ? Number(value) : null })}
                    >
                      <SelectTrigger className="w-full"><SelectValue placeholder="请选择托管 CNAME 的域名" /></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {targetDomainOptions.map((domain) => (
                            <SelectItem key={domain.value} value={domain.value}>{domain.label}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>生成的 CNAME 记录值将位于这个已托管域名下。</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="dcv-domains">允许托管的域名</FieldLabel>
                    <Textarea
                      id="dcv-domains"
                      value={selectedDcvTemplate.allowedDomains.join('\n')}
                      placeholder={'example.com\nexample.net'}
                      onChange={(event) => updateDcvTemplate({ allowedDomains: event.target.value.split(/[\r\n,]+/).map((item) => item.trim()).filter(Boolean) })}
                    />
                    <FieldDescription>每行一个，自动包含其子域名；留空表示不限制。</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="dcv-record-template">目标主机记录模板</FieldLabel>
                    <Input id="dcv-record-template" value={selectedDcvTemplate.targetRecordNameTemplate} required onChange={(event) => updateDcvTemplate({ targetRecordNameTemplate: event.target.value })} />
                    <FieldDescription>默认 {'{domainWithDashes}.cname'}，支持 {'{domain}'} 和 {'{domainWithDashes}'}。</FieldDescription>
                  </Field>
                </>
              ) : null}
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
      <Button className="self-start" type="submit" disabled={save.isPending}>
        {save.isPending ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
        保存证书设置
      </Button>
    </form>
  )
}
