import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRightIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, RefreshCwIcon, RouteIcon, SearchIcon, Trash2Icon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { apiDelete, apiGet, apiPost, apiPut } from '@/api/client'
import type { AxisNowAccount, AxisNowDomain, AxisNowDomainOptions, DataResponse, OperationResult, PageResponse } from '@/api/types'
import { ConfirmAction } from '@/components/confirm-action'
import { DataTable, type DataColumn } from '@/components/data-table'
import { ListPagination } from '@/components/list-pagination'
import { LoadingTable } from '@/components/loading-table'
import { QueryError } from '@/components/query-error'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { formatDateTime } from '@/lib/format'

export function AxisNowDomainsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [queryText, setQueryText] = useState('')
  const [accountId, setAccountId] = useState('')
  const accounts = useQuery({
    queryKey: ['axisnow-accounts'],
    queryFn: async () => (await apiGet<DataResponse<AxisNowAccount[]>>('/api/web/v1/axisnow/accounts')).data,
  })
  const domains = useQuery({
    queryKey: ['axisnow-domains', page, queryText, accountId],
    queryFn: () => apiGet<PageResponse<AxisNowDomain>>('/api/web/v1/axisnow/domains', {
      page,
      pageSize: 20,
      q: queryText,
      accountId: accountId || undefined,
      sort: 'updated_at',
      order: 'desc',
    }),
  })
  const remove = useApiMutation<AxisNowDomain, DataResponse<OperationResult>>({
    mutationFn: (domain) => apiDelete(`/api/web/v1/axisnow/accounts/${domain.accountId}/domains/${domain.uuid}`),
    successMessage: 'DNS 路由域名已删除',
    invalidate: [['axisnow-domains']],
  })
  const columns: DataColumn<AxisNowDomain>[] = [
    {
      key: 'domain',
      label: '域名',
      render: (domain) => (
        <div className="min-w-64">
          <Link className="font-medium text-primary hover:underline" to={`/axisnow?tab=domains&accountId=${domain.accountId}&domainUuid=${domain.uuid}&domain=${encodeURIComponent(domain.domain)}`}>{domain.domain}</Link>
          <p className="text-xs text-muted-foreground">{domain.eipCount} EIP · {domain.ruleCount} 路由规则</p>
        </div>
      ),
    },
    { key: 'account', label: '平台账户', render: (domain) => domain.accountName },
    { key: 'hosting', label: '托管类型', render: (domain) => <Badge variant="outline">{domain.providerSource === 'platform' ? 'AxisNow 托管' : '自托管'}</Badge> },
    { key: 'type', label: '记录类型', render: (domain) => <code>{domain.recordType}</code> },
    { key: 'provider', label: 'DNS 提供商', render: (domain) => domain.providerType ?? '—' },
    { key: 'time', label: '上次编辑时间', render: (domain) => formatDateTime(domain.updatedAt) },
    {
      key: 'actions',
      label: '',
      className: 'w-12',
      render: (domain) => (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`管理 ${domain.domain}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link to={`/axisnow?tab=domains&accountId=${domain.accountId}&domainUuid=${domain.uuid}&domain=${encodeURIComponent(domain.domain)}`} />}><RouteIcon />路由规则</DropdownMenuItem>
              <DomainDialog trigger={<DropdownMenuItem closeOnClick={false}><PencilIcon />编辑</DropdownMenuItem>} accounts={accounts.data ?? []} domain={domain} />
              <ConfirmAction trigger={<DropdownMenuItem variant="destructive" closeOnClick={false}><Trash2Icon />删除</DropdownMenuItem>} title="删除 DNS 路由域名？" description={`${domain.domain} 及其路由规则可能受到影响。`} destructive pending={remove.isPending} onConfirm={() => remove.mutate(domain)} />
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const submitSearch = () => {
    setPage(1)
    setQueryText(search.trim())
  }
  const reset = () => {
    setSearch('')
    setQueryText('')
    setAccountId('')
    setPage(1)
    void domains.refetch()
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <form className="grid gap-2 lg:grid-cols-[minmax(16rem,1fr)_14rem_auto_auto_auto]" onSubmit={(event) => { event.preventDefault(); submitSearch() }}>
            <div className="relative"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索域名、名称或平台账户" /></div>
            <Select items={[{ value: 'all', label: '全部平台账户' }, ...(accounts.data ?? []).map((account) => ({ value: String(account.id), label: account.name }))]} value={accountId || 'all'} onValueChange={(value) => { setAccountId(value === 'all' ? '' : value ?? ''); setPage(1) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部平台账户</SelectItem>{(accounts.data ?? []).map((account) => <SelectItem key={account.id} value={String(account.id)}>{account.name}</SelectItem>)}</SelectGroup></SelectContent></Select>
            <Button type="submit"><SearchIcon data-icon="inline-start" />搜索</Button>
            <Button type="button" variant="outline" onClick={reset}><RefreshCwIcon data-icon="inline-start" />刷新</Button>
            <DomainDialog trigger={<Button type="button"><PlusIcon data-icon="inline-start" />添加</Button>} accounts={accounts.data ?? []} />
          </form>
          {accounts.isError ? <QueryError error={accounts.error} retry={() => void accounts.refetch()} /> : null}
          {domains.isError ? <QueryError error={domains.error} retry={() => void domains.refetch()} /> : domains.isPending ? <LoadingTable /> : <DataTable rows={domains.data.data} columns={columns} rowKey={(domain) => `${domain.accountId}:${domain.uuid}`} emptyTitle="暂无 DNS 路由域名" emptyDescription="添加 AxisNow 平台账户后即可创建调度域名。" />}
          {domains.data ? <ListPagination meta={domains.data.meta} onPageChange={setPage} /> : null}
        </CardContent>
      </Card>
    </div>
  )
}

function DomainDialog({ trigger, accounts, domain }: { trigger: React.ReactElement; accounts: AxisNowAccount[]; domain?: AxisNowDomain }) {
  const [open, setOpen] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [providerSource, setProviderSource] = useState<'platform' | 'self-hosted'>('platform')
  const [domainValue, setDomainValue] = useState('')
  const [prefix, setPrefix] = useState('')
  const [zoneUuid, setZoneUuid] = useState('')
  const [providerUuid, setProviderUuid] = useState('')
  const [recordType, setRecordType] = useState<'A' | 'CNAME'>('A')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [shareDefault, setShareDefault] = useState(false)
  const [exposeEips, setExposeEips] = useState(false)
  const options = useQuery({
    queryKey: ['axisnow-options', accountId, 'domain'],
    queryFn: async () => (await apiGet<DataResponse<AxisNowDomainOptions>>(`/api/web/v1/axisnow/accounts/${accountId}/options`, { scope: 'domain' })).data,
    enabled: open && Boolean(accountId),
  })
  const save = useApiMutation<Record<string, unknown>, DataResponse<OperationResult>>({
    mutationFn: (body) => domain ? apiPut(`/api/web/v1/axisnow/domains/${domain.uuid}`, body) : apiPost('/api/web/v1/axisnow/domains', body),
    successMessage: domain ? 'DNS 路由域名已更新' : 'DNS 路由域名已添加',
    invalidate: [['axisnow-domains']],
  })
  const systemZones = useMemo(() => (options.data?.systemProviders ?? []).flatMap((provider) => provider.zones.map((zone) => ({ ...zone, provider }))), [options.data])
  const selectedZone = systemZones.find((zone) => zone.uuid === zoneUuid)
  const selectedProviders = useMemo(() => {
    const providers = providerSource === 'platform' ? options.data?.systemProviders ?? [] : options.data?.providers ?? []
    if (!domain?.dnsProviderUuid || providers.some((provider) => provider.uuid === domain.dnsProviderUuid)) return providers
    return [...providers, {
      uuid: domain.dnsProviderUuid,
      name: domain.providerType ?? '当前 DNS 提供商',
      type: domain.providerType ?? '',
      source: domain.providerSource,
      zones: [],
    }]
  }, [domain, options.data, providerSource])

  useEffect(() => {
    if (!open) return
    const nextAccountId = String(domain?.accountId ?? accounts[0]?.id ?? '')
    setAccountId(nextAccountId)
    setProviderSource(domain?.providerSource ?? 'platform')
    setDomainValue(domain?.domain ?? '')
    setPrefix('')
    setZoneUuid(domain?.dnsZoneUuid ?? '')
    setProviderUuid(domain?.dnsProviderUuid ?? '')
    setRecordType(domain?.recordType ?? 'A')
    setName(domain?.name ?? '')
    setDescription(domain?.description ?? '')
    setShareDefault(domain?.shareDefault ?? false)
    setExposeEips(domain?.exposeEips ?? false)
  }, [accounts, domain, open])

  useEffect(() => {
    if (!options.data) return
    // Existing domains keep the provider and managed zone reported by
    // AxisNow. Falling back to the first option here could display and submit
    // a different provider when an older managed zone is absent from options.
    if (domain) return
    if (providerSource === 'platform') {
      const zone = systemZones.find((item) => item.uuid === zoneUuid) ?? systemZones[0]
      if (!zone) return
      setZoneUuid(zone.uuid)
      setProviderUuid(zone.provider.uuid)
    } else if (!selectedProviders.some((provider) => provider.uuid === providerUuid)) {
      setProviderUuid(selectedProviders[0]?.uuid ?? '')
    }
  }, [domain, options.data, prefix, providerSource, providerUuid, selectedProviders, systemZones, zoneUuid])

  const completeDomain = domain?.domain ?? (providerSource === 'platform'
    ? `${prefix.trim().replace(/^\.+|\.+$/g, '')}.${selectedZone?.zone.replace(/^\.+|\.+$/g, '') ?? ''}`.replace(/\.$/, '')
    : domainValue.trim())
  const canSubmit = Boolean(accountId && providerUuid && completeDomain && (!domain || providerSource === domain.providerSource))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        <form onSubmit={(event) => {
          event.preventDefault()
          const body = { accountId: Number(accountId), providerSource, dnsProviderUuid: providerUuid, dnsZoneUuid: providerSource === 'platform' ? zoneUuid : null, recordType, name: name || null, description: description || null, shareDefault, exposeEips }
          save.mutate(domain ? body : { ...body, domain: completeDomain }, { onSuccess: () => setOpen(false) })
        }}>
          <DialogHeader><DialogTitle>{domain ? '编辑 DNS 路由域名' : '新增 DNS 路由域名'}</DialogTitle><DialogDescription>AxisNow 托管域名使用锁定后缀；自托管域名由已接入的 DNS 提供商解析。</DialogDescription></DialogHeader>
          <div className="py-5">
            <FieldGroup>
              <Field><FieldLabel>平台账户</FieldLabel><Select items={accounts.map((account) => ({ value: String(account.id), label: account.name }))} value={accountId || null} disabled={Boolean(domain)} onValueChange={(value) => setAccountId(value ?? '')}><SelectTrigger className="w-full"><SelectValue placeholder="请选择平台账户" /></SelectTrigger><SelectContent><SelectGroup>{accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>{account.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
              <Field><FieldLabel>托管类型</FieldLabel><Select items={[{ value: 'platform', label: 'AxisNow 托管' }, { value: 'self-hosted', label: '自托管' }]} value={providerSource} disabled={Boolean(domain)} onValueChange={(value) => setProviderSource((value ?? 'platform') as 'platform' | 'self-hosted')}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="platform">AxisNow 托管</SelectItem><SelectItem value="self-hosted">自托管</SelectItem></SelectGroup></SelectContent></Select></Field>
              {domain ? <Field data-disabled><FieldLabel htmlFor="axisnow-domain-readonly">具体域名</FieldLabel><Input id="axisnow-domain-readonly" value={domain.domain} disabled /><FieldDescription>AxisNow 域名创建后不能修改；如需更换域名，请删除后重新创建。</FieldDescription></Field> : providerSource === 'platform' ? <Field><FieldLabel>具体域名</FieldLabel><div className="flex"><Input className="rounded-r-none" value={prefix} onChange={(event) => setPrefix(event.target.value)} placeholder="域名前缀，例如 china-optimized-hcdn.asia" /><Select items={systemZones.map((zone) => ({ value: zone.uuid, label: zone.zone }))} value={zoneUuid || null} onValueChange={(value) => { const next = value ?? ''; setZoneUuid(next); const zone = systemZones.find((item) => item.uuid === next); setProviderUuid(zone?.provider.uuid ?? '') }}><SelectTrigger className="w-56 rounded-l-none border-l-0"><SelectValue placeholder="选择后缀" /></SelectTrigger><SelectContent><SelectGroup>{systemZones.map((zone) => <SelectItem key={zone.uuid} value={zone.uuid}>.{zone.zone}</SelectItem>)}</SelectGroup></SelectContent></Select></div><FieldDescription>后缀由 AxisNow 提供且不可自由修改。</FieldDescription></Field> : <Field><FieldLabel htmlFor="axisnow-domain">具体域名</FieldLabel><Input id="axisnow-domain" value={domainValue} onChange={(event) => setDomainValue(event.target.value)} placeholder="edge.example.com" /><FieldDescription>请输入具体完整域名，不是根域名。</FieldDescription></Field>}
              <div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel>记录类型</FieldLabel><Select items={[{ value: 'A', label: 'A' }, { value: 'CNAME', label: 'CNAME' }]} value={recordType} disabled={Boolean(domain)} onValueChange={(value) => setRecordType((value ?? 'A') as 'A' | 'CNAME')}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="A">A</SelectItem><SelectItem value="CNAME">CNAME</SelectItem></SelectGroup></SelectContent></Select></Field><Field><FieldLabel>DNS 提供商</FieldLabel><Select items={selectedProviders.map((provider) => ({ value: provider.uuid, label: `${provider.name} (${provider.type || '—'})` }))} value={providerUuid || null} disabled={providerSource === 'platform'} onValueChange={(value) => setProviderUuid(value ?? '')}><SelectTrigger className="w-full"><SelectValue placeholder="请选择 DNS 提供商" /></SelectTrigger><SelectContent><SelectGroup>{selectedProviders.map((provider) => <SelectItem key={provider.uuid} value={provider.uuid}>{provider.name} ({provider.type || '—'})</SelectItem>)}</SelectGroup></SelectContent></Select></Field></div>
              <Field><FieldLabel htmlFor="axisnow-domain-name">名称</FieldLabel><Input id="axisnow-domain-name" value={name} maxLength={50} onChange={(event) => setName(event.target.value)} placeholder="可选，便于备注" /></Field>
              <Field><FieldLabel htmlFor="axisnow-domain-description">说明</FieldLabel><Textarea id="axisnow-domain-description" value={description} maxLength={255} onChange={(event) => setDescription(event.target.value)} /></Field>
              {domain ? <><Field orientation="horizontal"><FieldContent><FieldTitle>默认共享</FieldTitle><FieldDescription>新订阅者默认共享此域名。</FieldDescription></FieldContent><Checkbox checked={shareDefault} onCheckedChange={(checked) => setShareDefault(Boolean(checked))} /></Field><Field orientation="horizontal"><FieldContent><FieldTitle>展示 EIP</FieldTitle><FieldDescription>向订阅者展示此域名使用的 EIP。</FieldDescription></FieldContent><Checkbox checked={exposeEips} onCheckedChange={(checked) => setExposeEips(Boolean(checked))} /></Field></> : null}
            </FieldGroup>
            {options.isError ? <QueryError error={options.error} retry={() => void options.refetch()} /> : null}
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button><Button type="submit" disabled={save.isPending || !canSubmit}>{save.isPending ? <Spinner data-icon="inline-start" /> : <ArrowRightIcon data-icon="inline-start" />}确认</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
