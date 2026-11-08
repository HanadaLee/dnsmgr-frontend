import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DownloadIcon } from 'lucide-react'

import { apiGetAll } from '@/api/client'
import type { DomainAccountSummary, DomainSummary } from '@/api/types'
import { BatchPagedTable, BatchSelect } from '@/components/batch-operations/common'
import { BatchSubmit, type BatchComplete } from '@/components/batch-operations/submit'
import { QueryError } from '@/components/query-error'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { BATCH_LIMIT, domainNamesFromText, normalizedDomain, type BatchPlan } from '@/lib/batch-operations'
import { downloadSheet } from '@/lib/batch-files'

type AvailableDomain = { providerId: string; name: string; recordCount: number; alreadyAdded: boolean }

export function AddDomains({
  busy,
  onBusyChange,
  onComplete,
}: {
  busy: boolean
  onBusyChange: (busy: boolean) => void
  onComplete: BatchComplete
}) {
  const accounts = useQuery({
    queryKey: ['domain-accounts', 'batch-all'],
    queryFn: () => apiGetAll<DomainAccountSummary>('/api/web/v1/domain-accounts'),
  })
  const [accountId, setAccountId] = useState('')
  const [mode, setMode] = useState('existing')
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const names = domainNamesFromText(text)
  const account = accounts.data?.find((item) => String(item.id) === accountId)

  async function prepare(): Promise<BatchPlan[]> {
    if (!account) throw new Error('请选择 DNS 账户')
    if (!names.length || names.length > BATCH_LIMIT) throw new Error(`请输入 1–${BATCH_LIMIT} 个域名`)
    const available =
      mode === 'existing'
        ? await apiGetAll<AvailableDomain>(`/api/web/v1/domain-accounts/${accountId}/available-domains`)
        : []
    return names.map((name, index) => {
      const match = available.find((domain) => normalizedDomain(domain.name) === name)
      const issues: string[] = []
      if (
        name.length > 253 ||
        !/^(?:[a-z\d\u0080-\uffff](?:[a-z\d\u0080-\uffff-]*[a-z\d\u0080-\uffff])?\.)+[a-z\d\u0080-\uffff-]+$/i.test(
          name,
        )
      )
        issues.push('域名格式不合法，请勿填写协议、路径或通配符')
      if (mode === 'existing' && !match) issues.push('该 DNS 账户没有返回此域名；不会自动改为新建')
      if (match?.alreadyAdded) issues.push('此账户的域名已添加，无需重复添加')
      return {
        key: `${account.id}:${name}`,
        domainId: -(index + 1),
        domainName: name,
        provider: `${account.provider.label} · ${account.name}`,
        name: '@',
        action: 'add-domain',
        method: 'POST',
        path: '/api/web/v1/domains',
        body: {
          accountId: account.id,
          mode,
          name,
          ...(match ? { providerDomainId: match.providerId, recordCount: match.recordCount } : {}),
        },
        after: mode === 'existing' ? '接入已有域名（不改动现有解析）' : '在所选 DNS 账户下创建域名并接入',
        issues,
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>批量添加域名</CardTitle>
        <CardDescription>
          先选择 DNS 账户，再按行填写域名。可接入账户中的已有域名，或在服务商支持时创建新域名。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {accounts.isError ? <QueryError error={accounts.error} retry={() => void accounts.refetch()} /> : null}
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>DNS 账户</FieldLabel>
            <BatchSelect
              label="添加域名的 DNS 账户"
              value={accountId}
              items={[
                { value: '', label: accounts.isPending ? '正在加载账户…' : '请选择 DNS 账户' },
                ...(accounts.data ?? []).map((item) => ({
                  value: String(item.id),
                  label: `${item.provider.label} · ${item.name}`,
                })),
              ]}
              disabled={busy || accounts.isPending}
              onChange={(value) => {
                setAccountId(value)
                setSubmitted(false)
              }}
            />
          </Field>
          <Field>
            <FieldLabel>添加方式</FieldLabel>
            <BatchSelect
              label="添加域名的方式"
              value={mode}
              items={[
                { value: 'existing', label: '接入账户中的已有域名' },
                { value: 'new', label: '在 DNS 服务商创建新域名' },
              ]}
              disabled={busy}
              onChange={(value) => {
                setMode(value)
                setSubmitted(false)
              }}
            />
          </Field>
        </FieldGroup>
        <Field>
          <FieldLabel htmlFor="batch-new-domain-names">域名列表</FieldLabel>
          <Textarea
            id="batch-new-domain-names"
            rows={8}
            placeholder={'example.com\nexample.net'}
            value={text}
            disabled={busy}
            onChange={(event) => {
              setText(event.target.value)
              setSubmitted(false)
            }}
          />
        </Field>
        <p className="text-sm text-muted-foreground">
          已识别 {names.length} 个域名，重复项自动合并，末尾的点会去除。单次最多 {BATCH_LIMIT} 个。
        </p>
        {submitted ? (
          <Alert>
            <AlertDescription>
              本次输入已执行过。如需添加其他域名，请调整输入；失败项可在下方单独重试。
            </AlertDescription>
          </Alert>
        ) : null}
        <BatchSubmit
          label="添加域名"
          prepare={prepare}
          busy={busy}
          disabled={!account || !names.length || submitted}
          onBusyChange={onBusyChange}
          onComplete={(label, results) => {
            setSubmitted(true)
            onComplete(label, results)
          }}
        />
      </CardContent>
    </Card>
  )
}

export function SelectedDomainTask({
  domains,
  task,
  disabled,
  busy,
  onBusyChange,
  onComplete,
}: {
  domains: DomainSummary[]
  task: 'delete-domain' | 'export-domain'
  disabled: boolean
  busy: boolean
  onBusyChange: (busy: boolean) => void
  onComplete: BatchComplete
}) {
  async function exportDomains() {
    try {
      await downloadSheet(
        '域名列表',
        ['域名 ID', '域名', 'DNS 服务商', 'DNS 账户', '账户 ID', '域名分组', '记录数', '到期时间', '备注'],
        domains.map((domain) => [
          domain.id,
          domain.name,
          domain.provider.label,
          domain.provider.accountLabel,
          domain.provider.accountId,
          domain.category,
          domain.recordCount,
          domain.expiresAt,
          domain.remark,
        ]),
      )
    } catch (error) {
      toast.add({
        title: '导出失败',
        description: error instanceof Error ? error.message : '无法生成文件',
        type: 'error',
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. {task === 'delete-domain' ? '核对要移除的域名' : '导出域名'}</CardTitle>
        <CardDescription>共 {domains.length} 个域名 / DNS 账户组合。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {task === 'delete-domain' ? (
          <Alert variant="destructive">
            <AlertDescription>
              此操作从本系统移除域名，并删除关联的解析监控、定时任务、优选 IP 任务和域名别名。不删除 DNS
              服务商中的域名或解析记录；本系统内的关联配置无法在这里恢复。
            </AlertDescription>
          </Alert>
        ) : null}
        <BatchPagedTable
          rows={domains}
          rowKey={(domain) => String(domain.id)}
          columns={[
            { key: 'name', label: '域名', render: (domain) => domain.name },
            {
              key: 'provider',
              label: 'DNS 服务商 / 账户',
              render: (domain) =>
                `${domain.provider.label} · ${domain.provider.accountLabel ?? domain.provider.accountId ?? '—'}`,
            },
            { key: 'category', label: '分组', render: (domain) => domain.category ?? '未分组' },
            { key: 'count', label: '记录数', render: (domain) => domain.recordCount },
          ]}
        />
        {task === 'export-domain' ? (
          <Button
            type="button"
            className="self-start"
            disabled={disabled || busy || !domains.length}
            onClick={() => void exportDomains()}
          >
            <DownloadIcon data-icon="inline-start" />
            导出所选 {domains.length} 个域名
          </Button>
        ) : (
          <BatchSubmit
            label="移除域名"
            destructive
            busy={busy}
            disabled={disabled || !domains.length}
            onBusyChange={onBusyChange}
            onComplete={onComplete}
            prepare={() =>
              domains.map(
                (domain): BatchPlan => ({
                  key: String(domain.id),
                  domainId: domain.id,
                  domainName: domain.name,
                  provider: domain.provider.accountLabel ?? domain.provider.label,
                  name: '@',
                  action: 'delete-domain',
                  method: 'DELETE',
                  path: `/api/web/v1/domains/${domain.id}`,
                  before: '已接入本系统',
                  after: '移除域名及本系统内的关联任务',
                  issues: [],
                }),
              )
            }
          />
        )}
      </CardContent>
    </Card>
  )
}
