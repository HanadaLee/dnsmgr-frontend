import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BellIcon,
  BellOffIcon,
  BellRingIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  TagsIcon,
  Trash2Icon,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import { apiDelete, apiGet, apiGetAll, apiPatch, apiPost, apiPut } from '@/api/client'
import type { DataResponse, DnsProviderDefinition, DomainAccountSummary, DomainCategory, DomainExpirySettings, DomainSummary, OperationResult, PageResponse } from '@/api/types'
import { useSession } from '@/auth/session-context'
import { ConfirmAction } from '@/components/confirm-action'
import { DataTable, type DataColumn } from '@/components/data-table'
import { FormDialog } from '@/components/form-dialog'
import { ListPagination } from '@/components/list-pagination'
import { LoadingTable } from '@/components/loading-table'
import { PageHeader } from '@/components/page-header'
import { QueryError } from '@/components/query-error'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { formatDateTime } from '@/lib/format'

type AvailableDomain = { providerId: string; name: string; recordCount: number; alreadyAdded: boolean }

function asIds(selected: Set<string>): number[] {
  return Array.from(selected, Number).filter((id) => Number.isInteger(id) && id > 0)
}

async function allAvailableDomains(accountId: string) {
  const rows: AvailableDomain[] = []
  let page = 1
  while (true) {
    const response = await apiGet<PageResponse<AvailableDomain>>(`/api/web/v1/domain-accounts/${accountId}/available-domains`, { page, pageSize: 100 })
    rows.push(...response.data)
    if (rows.length >= response.meta.total || response.data.length === 0) return rows
    page += 1
  }
}

export function DomainsPage() {
  const session = useSession()
  const canManageDomains = session.capabilities.domainAccounts
  const [searchParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [queryText, setQueryText] = useState('')
  const [accountFilter, setAccountFilter] = useState(() => /^\d+$/.test(searchParams.get('accountId') ?? '') ? String(searchParams.get('accountId')) : 'all')
  const [providerFilter, setProviderFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState(() => /^\d+$/.test(searchParams.get('categoryId') ?? '') ? String(searchParams.get('categoryId')) : 'all')
  const [expiryFilter, setExpiryFilter] = useState('all')
  const [sort, setSort] = useState('id')
  const [order, setOrder] = useState('desc')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const domains = useQuery({
    queryKey: ['domains', page, queryText, accountFilter, providerFilter, categoryFilter, expiryFilter, sort, order],
    queryFn: () => apiGet<PageResponse<DomainSummary>>('/api/web/v1/domains', { page, pageSize: 20, q: queryText, accountId: accountFilter === 'all' ? undefined : Number(accountFilter), provider: providerFilter === 'all' ? undefined : providerFilter, categoryId: categoryFilter === 'all' ? undefined : Number(categoryFilter), expiryStatus: expiryFilter === 'all' ? undefined : expiryFilter, sort, order }),
  })
  const accounts = useQuery({
    queryKey: ['domain-accounts', 'options'],
    queryFn: () => apiGetAll<DomainAccountSummary>('/api/web/v1/domain-accounts'),
    enabled: canManageDomains,
  })
  const categories = useQuery({
    queryKey: ['domain-categories', 'options'],
    queryFn: () => apiGetAll<DomainCategory>('/api/web/v1/domain-categories', { sort: 'sort', order: 'asc' }),
    enabled: canManageDomains,
  })
  const providers = useQuery({
    queryKey: ['domain-account-providers'],
    queryFn: async () => (await apiGet<DataResponse<DnsProviderDefinition[]>>('/api/web/v1/domain-account-providers')).data,
    enabled: canManageDomains,
  })
  const expirySettings = useQuery({ queryKey: ['domain-expiry-settings'], queryFn: async () => (await apiGet<DataResponse<DomainExpirySettings>>('/api/web/v1/domains/expiry-settings')).data, enabled: canManageDomains })
  const invalidate = [['domains']] as const
  const create = useApiMutation<Record<string, unknown>, DataResponse<OperationResult>>({
    mutationFn: (body) => apiPost('/api/web/v1/domains', body), successMessage: '域名已添加', invalidate: [...invalidate],
  })
  const update = useApiMutation<{ id: number; body: Record<string, unknown> }, DataResponse<OperationResult>>({
    mutationFn: ({ id, body }) => apiPatch(`/api/web/v1/domains/${id}`, body), successMessage: '域名设置已更新', invalidate: [...invalidate],
  })
  const remove = useApiMutation<number, DataResponse<OperationResult>>({
    mutationFn: (id) => apiDelete(`/api/web/v1/domains/${id}`), successMessage: '域名已删除', invalidate: [...invalidate],
  })
  const refresh = useApiMutation<number, DataResponse<OperationResult>>({
    mutationFn: (id) => apiPost(`/api/web/v1/domains/${id}/refresh-expiry`, {}), successMessage: '已刷新域名有效期', invalidate: [...invalidate],
  })
  const batch = useApiMutation<{ path: string; body: Record<string, unknown>; message: string }, DataResponse<OperationResult>>({
    mutationFn: ({ path, body }) => apiPost(`/api/web/v1/domains/${path}`, body),
    successMessage: (result, variables) => result.message ?? variables.message,
    invalidate: [...invalidate],
    onSuccess: () => setSelected(new Set()),
  })
  const batchPatch = useApiMutation<{ path: string; body: Record<string, unknown>; message: string }, DataResponse<OperationResult>>({
    mutationFn: ({ path, body }) => apiPatch(`/api/web/v1/${path}`, body),
    successMessage: (result, variables) => result.message ?? variables.message,
    invalidate: [...invalidate],
    onSuccess: () => setSelected(new Set()),
  })
  const saveExpirySettings = useApiMutation<DomainExpirySettings, DataResponse<OperationResult>>({ mutationFn: (body) => apiPut('/api/web/v1/domains/expiry-settings', body), successMessage: '域名到期提醒设置已保存', invalidate: [['domain-expiry-settings']] })

  const accountOptions = (accounts.data ?? []).map((account) => ({ value: String(account.id), label: `${account.name} · ${account.provider.label}` }))
  const creationProviders = new Set((providers.data ?? []).filter((provider) => provider.capabilities.domainCreation === true).map((provider) => provider.type))
  const creationAccountOptions = (accounts.data ?? []).filter((account) => creationProviders.has(account.provider.type)).map((account) => ({ value: String(account.id), label: `${account.name} · ${account.provider.label}` }))
  const providerOptions = Array.from(new Map((accounts.data ?? []).map((account) => [account.provider.type, account.provider.label])).entries()).map(([value, label]) => ({ value, label }))
  const categoryOptions = [{ value: '0', label: '未分类' }, ...(categories.data ?? []).map((category) => ({ value: String(category.id), label: category.name }))]
  const selectedIds = asIds(selected)

  const columns: DataColumn<DomainSummary>[] = [
    {
      key: 'domain', label: '域名', render: (domain) => (
        <div className="min-w-52">
          <Link className="font-medium hover:text-primary hover:underline" to={`/domains/${domain.id}`}>{domain.name}</Link>
          <p className="mt-0.5 text-xs text-muted-foreground">分类：{domain.category ?? '未分类'}</p>
          {domain.remark ? <p className="max-w-64 truncate text-xs text-muted-foreground" title={domain.remark}>备注：{domain.remark}</p> : null}
        </div>
      ),
    },
    { key: 'provider', label: '服务商', render: (domain) => <div><p>{domain.provider.label}</p><p className="text-xs text-muted-foreground">{domain.provider.accountLabel ?? '—'}</p></div> },
    { key: 'records', label: '记录', render: (domain) => <span className="tabular-nums">{domain.recordCount}</span> },
    { key: 'addedAt', label: '添加时间', render: (domain) => <span className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(domain.addedAt)}</span> },
    { key: 'expiry', label: '有效期', render: (domain) => <div><p>{formatDateTime(domain.expiresAt)}</p><div className="mt-1"><StatusBadge value={domain.expiryLookup} /></div></div> },
    { key: 'state', label: '管理状态', render: (domain) => <div className="flex min-w-24 flex-col items-start gap-1"><StatusBadge value={domain.noticeEnabled ? 'enabled' : 'inactive'} label={domain.noticeEnabled ? '到期提醒' : '未提醒'} /><StatusBadge value={domain.hidden ? 'inactive' : 'enabled'} label={domain.hidden ? '已隐藏' : '正常显示'} /><StatusBadge value={domain.ssoEnabled ? 'enabled' : 'inactive'} label={domain.ssoEnabled ? '允许域名登录' : '禁止域名登录'} /></div> },
    {
      key: 'actions', label: '', className: 'w-12 text-right', render: (domain) => (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`管理 ${domain.name}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link to={`/domains/${domain.id}`} />}><ExternalLinkIcon />解析记录</DropdownMenuItem>
              <DropdownMenuItem onClick={() => refresh.mutate(domain.id)}><RefreshCwIcon />刷新有效期</DropdownMenuItem>
              {canManageDomains ? <DomainEditItem domain={domain} categories={categoryOptions} pending={update.isPending} onSave={(body, close) => update.mutate({ id: domain.id, body }, { onSuccess: close })} /> : null}
              {canManageDomains ? <ConfirmAction
                trigger={<DropdownMenuItem variant="destructive" closeOnClick={false}><Trash2Icon />删除</DropdownMenuItem>}
                title={`删除 ${domain.name}？`}
                description="域名及其关联数据将从管理系统移除，此操作无法撤销。"
                destructive pending={remove.isPending} onConfirm={() => remove.mutate(domain.id)}
              /> : null}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="DNS"
        title="域名管理"
        description="管理域名、解析记录、分类、到期提醒与供应商同步。"
        action={
          canManageDomains ? <div className="flex flex-wrap gap-2">
            {expirySettings.data ? <FormDialog
              trigger={<Button variant="outline"><BellRingIcon data-icon="inline-start" />提醒设置</Button>}
              title="域名到期提醒设置"
              description="在到期前指定天数发送通知；留空提醒天数即可关闭全局到期提醒。"
              initialValues={{ reminderDays: expirySettings.data.reminderDays.join(','), ...expirySettings.data.notifications }}
              fields={[
                { name: 'reminderDays', label: '到期前提醒天数', placeholder: '7,14', description: '多个天数使用英文逗号分隔。' },
                { name: 'email', label: '邮件通知', kind: 'switch' },
                { name: 'wechat', label: '微信公众号通知', kind: 'switch' },
                { name: 'telegram', label: 'Telegram 通知', kind: 'switch' },
                { name: 'robotWebhook', label: '群机器人 Webhook', kind: 'switch' },
                { name: 'customWebhook', label: '自定义 Webhook', kind: 'switch' },
              ]}
              pending={saveExpirySettings.isPending}
              onSubmit={(values, close) => {
                const reminderDays = String(values.reminderDays ?? '').split(',').map((value) => value.trim()).filter(Boolean).map(Number)
                if (reminderDays.some((value) => !Number.isSafeInteger(value) || value < 0)) { toast.add({ title: '提醒天数格式不正确', description: '请填写非负整数，并用英文逗号分隔。', type: 'error' }); return }
                saveExpirySettings.mutate({ reminderDays, notifications: { email: Boolean(values.email), wechat: Boolean(values.wechat), telegram: Boolean(values.telegram), robotWebhook: Boolean(values.robotWebhook), customWebhook: Boolean(values.customWebhook) } }, { onSuccess: close })
              }}
            /> : <Button variant="outline" disabled><BellRingIcon data-icon="inline-start" />提醒设置</Button>}
            <ImportDomainsDialog accounts={accountOptions} />
            {creationAccountOptions.length ? <FormDialog
              trigger={<Button><PlusIcon data-icon="inline-start" />创建域名</Button>}
              title="创建新域名"
              description="在支持域名创建的供应商账户中注册并接入新域名。"
              initialValues={{ mode: 'new', recordCount: 0 }}
              fields={[
                { name: 'accountId', label: '域名账户', kind: 'select', options: creationAccountOptions, required: true },
                { name: 'name', label: '域名', placeholder: 'example.com', required: true },
              ]}
              pending={create.isPending}
              onSubmit={(values, close) => create.mutate({ accountId: Number(values.accountId), mode: 'new', name: values.name, recordCount: 0 }, { onSuccess: close })}
            /> : null}
          </div> : null
        }
      />
      {canManageDomains && expirySettings.isError ? <QueryError error={expirySettings.error} retry={() => void expirySettings.refetch()} /> : null}
      {canManageDomains && providers.isError ? <QueryError error={providers.error} retry={() => void providers.refetch()} /> : null}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <form className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-[minmax(14rem,2fr)_repeat(6,minmax(8rem,1fr))_auto]" onSubmit={(event) => { event.preventDefault(); setPage(1); setSelected(new Set()); setQueryText(search.trim()) }}>
            <div className="relative"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索域名或备注" /></div>
            {canManageDomains ? <Select items={[{ value: 'all', label: '全部账户' }, ...accountOptions]} value={accountFilter} onValueChange={(value) => { setAccountFilter(value ?? 'all'); setPage(1); setSelected(new Set()) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部账户</SelectItem>{accountOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select> : null}
            {canManageDomains ? <Select items={[{ value: 'all', label: '全部平台' }, ...providerOptions]} value={providerFilter} onValueChange={(value) => { setProviderFilter(value ?? 'all'); setPage(1); setSelected(new Set()) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部平台</SelectItem>{providerOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select> : null}
            {canManageDomains ? <Select items={[{ value: 'all', label: '全部分类' }, ...categoryOptions]} value={categoryFilter} onValueChange={(value) => { setCategoryFilter(value ?? 'all'); setPage(1); setSelected(new Set()) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部分类</SelectItem>{categoryOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select> : null}
            <Select items={[{ value: 'all', label: '全部状态' }, { value: 'expiring', label: '即将到期' }, { value: 'expired', label: '已到期' }]} value={expiryFilter} onValueChange={(value) => { setExpiryFilter(value ?? 'all'); setPage(1); setSelected(new Set()) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部状态</SelectItem><SelectItem value="expiring">即将到期</SelectItem><SelectItem value="expired">已到期</SelectItem></SelectGroup></SelectContent></Select>
            <Select items={[{ value: 'id', label: '按添加顺序' }, { value: 'name', label: '按域名' }, { value: 'recordCount', label: '按记录数' }, { value: 'addedAt', label: '按添加时间' }, { value: 'registeredAt', label: '按注册时间' }, { value: 'expiresAt', label: '按到期时间' }, { value: 'noticeEnabled', label: '按提醒状态' }, { value: 'hidden', label: '按隐藏状态' }, { value: 'domainLoginEnabled', label: '按域名登录权限' }, { value: 'provider', label: '按服务商' }, { value: 'category', label: '按分类' }, { value: 'remark', label: '按备注' }]} value={sort} onValueChange={(value) => { setSort(value ?? 'id'); setPage(1); setSelected(new Set()) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="id">按添加顺序</SelectItem><SelectItem value="name">按域名</SelectItem><SelectItem value="recordCount">按记录数</SelectItem><SelectItem value="addedAt">按添加时间</SelectItem><SelectItem value="registeredAt">按注册时间</SelectItem><SelectItem value="expiresAt">按到期时间</SelectItem><SelectItem value="noticeEnabled">按提醒状态</SelectItem><SelectItem value="hidden">按隐藏状态</SelectItem><SelectItem value="domainLoginEnabled">按域名登录权限</SelectItem><SelectItem value="provider">按服务商</SelectItem><SelectItem value="category">按分类</SelectItem><SelectItem value="remark">按备注</SelectItem></SelectGroup></SelectContent></Select>
            <Select items={[{ value: 'desc', label: '降序' }, { value: 'asc', label: '升序' }]} value={order} onValueChange={(value) => { setOrder(value ?? 'desc'); setPage(1); setSelected(new Set()) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="desc">降序</SelectItem><SelectItem value="asc">升序</SelectItem></SelectGroup></SelectContent></Select>
            <Button type="submit" variant="outline">搜索</Button>
          </form>
          {canManageDomains && selected.size ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
              <span className="mr-auto text-sm">已选择 {selected.size} 项</span>
              <Button size="sm" variant="outline" nativeButton={false} render={<Link to={`/record-tools?tab=batch-add&domains=${selectedIds.join(',')}`} />}><PlusIcon data-icon="inline-start" />添加解析</Button>
              <Button size="sm" variant="outline" nativeButton={false} render={<Link to={`/record-tools?tab=batch-edit&domains=${selectedIds.join(',')}`} />}><PencilIcon data-icon="inline-start" />修改解析</Button>
              <FormDialog
                trigger={<Button size="sm" variant="outline"><TagsIcon data-icon="inline-start" />设置分类</Button>}
                title="批量设置分类"
                fields={[{ name: 'categoryId', label: '分类', kind: 'select', options: categoryOptions, required: true }]}
                pending={batchPatch.isPending}
                onSubmit={(values, close) => batchPatch.mutate({ path: 'domain-category-assignment', body: { ids: selectedIds, categoryId: Number(values.categoryId) }, message: '分类已更新' }, { onSuccess: close })}
              />
              <FormDialog
                trigger={<Button size="sm" variant="outline"><PencilIcon data-icon="inline-start" />设置备注</Button>}
                title="批量设置备注"
                fields={[{ name: 'remark', label: '备注', kind: 'textarea' }]}
                pending={batchPatch.isPending}
                onSubmit={(values, close) => batchPatch.mutate({ path: 'domains/batch-remark', body: { ids: selectedIds, remark: String(values.remark ?? '') || null }, message: '备注已更新' }, { onSuccess: close })}
              />
              <Button size="sm" variant="outline" onClick={() => batchPatch.mutate({ path: 'domains/batch-notice', body: { ids: selectedIds, enabled: true }, message: '到期提醒已启用' })}><BellIcon data-icon="inline-start" />开启提醒</Button>
              <Button size="sm" variant="outline" onClick={() => batchPatch.mutate({ path: 'domains/batch-notice', body: { ids: selectedIds, enabled: false }, message: '到期提醒已关闭' })}><BellOffIcon data-icon="inline-start" />关闭提醒</Button>
              <Button size="sm" variant="outline" onClick={() => batch.mutate({ path: 'expiry-refresh', body: { ids: selectedIds }, message: '已提交有效期刷新' })}><RefreshCwIcon data-icon="inline-start" />刷新有效期</Button>
              <Button size="sm" variant="outline" onClick={() => { const value = (domains.data?.data ?? []).filter((domain) => selected.has(String(domain.id))).map((domain) => domain.name).join('\n'); void navigator.clipboard.writeText(value); toast.add({ title: `已复制 ${selected.size} 个域名`, type: 'success' }) }}><CopyIcon data-icon="inline-start" />复制域名</Button>
              <ConfirmAction trigger={<Button size="sm" variant="destructive"><Trash2Icon data-icon="inline-start" />删除</Button>} title="删除所选域名？" description="所选域名及关联数据将被移除，此操作无法撤销。" destructive pending={batch.isPending} onConfirm={() => batch.mutate({ path: 'batch-delete', body: { ids: selectedIds }, message: '所选域名已删除' })} />
            </div>
          ) : null}
          {domains.isError ? <QueryError error={domains.error} retry={() => void domains.refetch()} /> : domains.isPending ? <LoadingTable /> : <DataTable rows={domains.data.data} columns={columns} rowKey={(domain) => String(domain.id)} selected={selected} onSelectedChange={setSelected} emptyTitle="暂无域名" emptyDescription="添加一个域名账户后即可接入域名。" />}
          {domains.data ? <ListPagination meta={domains.data.meta} onPageChange={(next) => { setSelected(new Set()); setPage(next) }} /> : null}
        </CardContent>
      </Card>
    </div>
  )
}

function DomainEditItem({ domain, categories, pending, onSave }: { domain: DomainSummary; categories: Array<{ value: string; label: string }>; pending: boolean; onSave: (body: Record<string, unknown>, close: () => void) => void }) {
  return (
    <FormDialog
      trigger={<DropdownMenuItem closeOnClick={false}><PencilIcon />编辑设置</DropdownMenuItem>}
      title={`编辑 ${domain.name}`}
      initialValues={{ hidden: domain.hidden, ssoEnabled: domain.ssoEnabled, noticeEnabled: domain.noticeEnabled, categoryId: String(domain.categoryId ?? 0), expiresAt: domain.expiresAt ?? '', remark: domain.remark ?? '' }}
      fields={[
        { name: 'categoryId', label: '分类', kind: 'select', options: categories },
        { name: 'expiresAt', label: '到期时间', placeholder: 'YYYY-MM-DD HH:mm:ss' },
        { name: 'remark', label: '备注', kind: 'textarea' },
        { name: 'noticeEnabled', label: '启用到期提醒', kind: 'switch' },
        { name: 'hidden', label: '在列表中隐藏', kind: 'switch' },
        { name: 'ssoEnabled', label: '允许域名用户登录', kind: 'switch' },
      ]}
      pending={pending}
      onSubmit={(values, close) => onSave({ ...values, categoryId: Number(values.categoryId), expiresAt: String(values.expiresAt ?? '') || null, remark: String(values.remark ?? '') || null }, close)}
    />
  )
}

function ImportDomainsDialog({ accounts }: { accounts: Array<{ value: string; label: string }> }) {
  const [accountId, setAccountId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const available = useQuery({
    queryKey: ['available-domains', accountId],
    queryFn: () => allAvailableDomains(accountId),
    enabled: Boolean(accountId),
  })
  const mutation = useApiMutation<void, DataResponse<OperationResult>>({
    mutationFn: () => apiPost('/api/web/v1/domains/import', {
      accountId: Number(accountId),
      domains: (available.data ?? []).filter((domain) => selected.has(domain.providerId)).map((domain) => ({ name: domain.name, providerDomainId: domain.providerId, recordCount: domain.recordCount })),
    }),
    successMessage: (result) => result.message ?? '所选域名已导入', invalidate: [['domains']], onSuccess: () => setSelected(new Set()),
  })
  return (
    <FormDialog
      trigger={<Button variant="outline"><DownloadIcon data-icon="inline-start" />从账户导入</Button>}
      title="从账户导入域名"
      description="读取供应商账户中的域名，并批量接入尚未管理的项目。"
      submitLabel={`导入 ${selected.size} 个域名`}
      pending={mutation.isPending}
      onSubmit={(_, close) => mutation.mutate(undefined, { onSuccess: close })}
    >
      {() => (
        <FieldGroup>
          <Field>
            <FieldLabel>域名账户</FieldLabel>
            <Select items={accounts} value={accountId || null} onValueChange={(value) => { setAccountId(value ?? ''); setSelected(new Set()) }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="请选择域名账户" /></SelectTrigger>
              <SelectContent><SelectGroup>{accounts.map((account) => <SelectItem key={account.value} value={account.value}>{account.label}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </Field>
          {available.isError ? <QueryError error={available.error} retry={() => void available.refetch()} /> : null}
          {available.data ? (
            <div className="max-h-72 overflow-y-auto rounded-lg border">
              <DataTable rows={available.data.filter((domain) => !domain.alreadyAdded)} columns={[
                { key: 'name', label: '域名', render: (domain) => domain.name },
                { key: 'count', label: '记录', render: (domain) => domain.recordCount },
              ]} rowKey={(domain) => domain.providerId} selected={selected} onSelectedChange={setSelected} emptyTitle="没有可导入的域名" emptyDescription="该账户中的域名均已接入。" />
            </div>
          ) : null}
        </FieldGroup>
      )}
    </FormDialog>
  )
}
