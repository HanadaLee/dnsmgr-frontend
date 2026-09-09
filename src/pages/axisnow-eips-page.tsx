import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MoreHorizontalIcon, PencilIcon, PlusIcon, RefreshCwIcon, SearchIcon, Trash2Icon } from 'lucide-react'

import { apiGet, apiPost, apiPut } from '@/api/client'
import type { AxisNowAccount, AxisNowEip, AxisNowEipOptions, DataResponse, OperationResult, PageResponse } from '@/api/types'
import { ConfirmAction } from '@/components/confirm-action'
import { CountryFlag } from '@/components/country-flag'
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
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { formatDateTime } from '@/lib/format'

export function AxisNowEipsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [queryText, setQueryText] = useState('')
  const [accountId, setAccountId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const accounts = useQuery({ queryKey: ['axisnow-accounts'], queryFn: async () => (await apiGet<DataResponse<AxisNowAccount[]>>('/api/web/v1/axisnow/accounts')).data })
  const eips = useQuery({
    queryKey: ['axisnow-eips', page, queryText, accountId],
    queryFn: () => apiGet<PageResponse<AxisNowEip>>('/api/web/v1/axisnow/eips', { page, pageSize: 20, q: queryText, accountId: accountId || undefined, sort: 'updated_at', order: 'desc' }),
  })
  const selectedRows = (eips.data?.data ?? []).filter((eip) => selected.has(rowKey(eip)) && eip.canManage)
  const remove = useApiMutation<AxisNowEip[], DataResponse<OperationResult>>({
    mutationFn: async (rows) => {
      const groups = new Map<number, AxisNowEip[]>()
      for (const row of rows) groups.set(row.accountId, [...(groups.get(row.accountId) ?? []), row])
      await Promise.all(Array.from(groups, ([id, items]) => apiPost('/api/web/v1/axisnow/eips/batch-delete', { accountId: id, uuids: items.map((item) => item.uuid) })))
      return { code: 'OK', data: { message: 'EIP 已删除' } }
    },
    successMessage: (_, rows) => rows.length > 1 ? `已删除 ${rows.length} 个 EIP` : 'EIP 已删除',
    invalidate: [['axisnow-eips'], ['axisnow-options']],
    onSuccess: () => setSelected(new Set()),
  })
  const columns: DataColumn<AxisNowEip>[] = [
    {
      key: 'address',
      label: 'EIP',
      render: (eip) => {
        const location = [eip.geo.provinceCode, eip.geo.cityName].filter(Boolean).join(' / ')
        return <div className="min-w-48"><p className="flex items-center gap-2 font-medium"><CountryFlag countryCode={eip.geo.countryCode} /><span>{eip.address}</span></p><p className="text-xs text-muted-foreground">{location || eip.geo.ispName || '—'}</p></div>
      },
    },
    { key: 'account', label: '平台账户', render: (eip) => eip.accountName },
    { key: 'tags', label: '标签', render: (eip) => eip.tagNames.length ? <div className="flex min-w-52 flex-wrap gap-1">{eip.tagNames.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div> : '—' },
    { key: 'reference', label: '被引用', render: (eip) => eip.referencedCount },
    { key: 'provider', label: '提供商', render: (eip) => <div><p>{eip.providerName}</p>{eip.dataOrigin === 'subscribed' ? <p className="text-xs text-muted-foreground">订阅资源</p> : null}</div> },
    { key: 'time', label: '更新时间', render: (eip) => formatDateTime(eip.updatedAt) },
    {
      key: 'actions', label: '', className: 'w-12', render: (eip) => eip.canManage ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`管理 ${eip.address}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuGroup>
            <EipDialog trigger={<DropdownMenuItem closeOnClick={false}><PencilIcon />编辑</DropdownMenuItem>} accounts={accounts.data ?? []} eip={eip} />
            <ConfirmAction trigger={<DropdownMenuItem variant="destructive" closeOnClick={false}><Trash2Icon />删除</DropdownMenuItem>} title="删除 EIP？" description={eip.address} destructive pending={remove.isPending} onConfirm={() => remove.mutate([eip])} />
          </DropdownMenuGroup></DropdownMenuContent>
        </DropdownMenu>
      ) : <Badge variant="outline">只读</Badge>,
    },
  ]
  const reset = () => {
    setSearch('')
    setQueryText('')
    setAccountId('')
    setPage(1)
    setSelected(new Set())
    void eips.refetch()
  }

  return (
    <div className="flex flex-col gap-6">
      <Card><CardContent className="flex flex-col gap-4">
        <form className="grid gap-2 lg:grid-cols-[minmax(16rem,1fr)_14rem_auto_auto_auto_auto]" onSubmit={(event) => { event.preventDefault(); setPage(1); setSelected(new Set()); setQueryText(search.trim()) }}>
          <div className="relative"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 EIP、标签、提供商或平台账户" /></div>
          <Select items={[{ value: 'all', label: '全部平台账户' }, ...(accounts.data ?? []).map((account) => ({ value: String(account.id), label: account.name }))]} value={accountId || 'all'} onValueChange={(value) => { setAccountId(value === 'all' ? '' : value ?? ''); setPage(1); setSelected(new Set()) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部平台账户</SelectItem>{(accounts.data ?? []).map((account) => <SelectItem key={account.id} value={String(account.id)}>{account.name}</SelectItem>)}</SelectGroup></SelectContent></Select>
          <Button type="submit"><SearchIcon data-icon="inline-start" />搜索</Button>
          <Button type="button" variant="outline" onClick={reset}><RefreshCwIcon data-icon="inline-start" />刷新</Button>
          <EipDialog trigger={<Button type="button"><PlusIcon data-icon="inline-start" />添加</Button>} accounts={accounts.data ?? []} />
          <ConfirmAction trigger={<Button type="button" variant="destructive" disabled={!selectedRows.length}><Trash2Icon data-icon="inline-start" />批量删除</Button>} title="删除所选 EIP？" description={`将删除 ${selectedRows.length} 个可管理的 EIP。`} destructive pending={remove.isPending} onConfirm={() => remove.mutate(selectedRows)} />
        </form>
        {accounts.isError ? <QueryError error={accounts.error} retry={() => void accounts.refetch()} /> : null}
        {eips.isError ? <QueryError error={eips.error} retry={() => void eips.refetch()} /> : eips.isPending ? <LoadingTable /> : <DataTable rows={eips.data.data} columns={columns} rowKey={rowKey} selected={selected} onSelectedChange={setSelected} isRowSelectable={(eip) => eip.canManage} emptyTitle="暂无 EIP" />}
        {eips.data ? <ListPagination meta={eips.data.meta} onPageChange={(next) => { setPage(next); setSelected(new Set()) }} /> : null}
      </CardContent></Card>
    </div>
  )
}

function rowKey(eip: AxisNowEip) {
  return `${eip.accountId}:${eip.uuid}`
}

function EipDialog({ trigger, accounts, eip }: { trigger: React.ReactElement; accounts: AxisNowAccount[]; eip?: AxisNowEip }) {
  const [open, setOpen] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [targetType, setTargetType] = useState<'edge' | 'cluster'>('edge')
  const [targetUuid, setTargetUuid] = useState('')
  const [tagUuids, setTagUuids] = useState<Set<string>>(new Set())
  const [addresses, setAddresses] = useState('')
  const [address, setAddress] = useState('')
  const options = useQuery({
    queryKey: ['axisnow-options', accountId, 'eip'],
    queryFn: async () => (await apiGet<DataResponse<AxisNowEipOptions>>(`/api/web/v1/axisnow/accounts/${accountId}/options`, { scope: 'eip' })).data,
    enabled: open && Boolean(accountId),
  })
  const targets = useMemo(() => targetType === 'edge' ? options.data?.edges ?? [] : options.data?.clusters ?? [], [options.data, targetType])
  const save = useApiMutation<Record<string, unknown>, DataResponse<OperationResult>>({
    mutationFn: (body) => eip ? apiPut(`/api/web/v1/axisnow/eips/${eip.uuid}`, body) : apiPost('/api/web/v1/axisnow/eips', body),
    successMessage: eip ? 'EIP 已更新' : 'EIP 已添加',
    invalidate: [['axisnow-eips'], ['axisnow-options']],
  })

  useEffect(() => {
    if (!open) return
    setAccountId(String(eip?.accountId ?? accounts[0]?.id ?? ''))
    setTargetType(eip?.ownerType ?? 'edge')
    setTargetUuid(eip?.ownerType === 'cluster' ? eip.clusterUuid ?? '' : eip?.edgeUuid ?? '')
    setTagUuids(new Set(eip?.tagUuids ?? []))
    setAddresses('')
    setAddress(eip?.address ?? '')
  }, [accounts, eip, open])

  useEffect(() => {
    if (!options.data || targets.some((target) => target.uuid === targetUuid)) return
    setTargetUuid(targets[0]?.uuid ?? '')
  }, [options.data, targetUuid, targets])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        <form onSubmit={(event) => {
          event.preventDefault()
          save.mutate({ accountId: Number(accountId), targetType, targetUuid, tagUuids: Array.from(tagUuids), ...(eip ? { address } : { addresses }) }, { onSuccess: () => setOpen(false) })
        }}>
          <DialogHeader><DialogTitle>{eip ? '编辑 EIP' : '新增 EIP'}</DialogTitle><DialogDescription>选择边缘或集群，并通过复选框绑定多个标签。</DialogDescription></DialogHeader>
          <div className="py-5"><FieldGroup>
            <Field><FieldLabel>平台账户</FieldLabel><Select items={accounts.map((account) => ({ value: String(account.id), label: account.name }))} value={accountId || null} disabled={Boolean(eip)} onValueChange={(value) => setAccountId(value ?? '')}><SelectTrigger className="w-full"><SelectValue placeholder="请选择平台账户" /></SelectTrigger><SelectContent><SelectGroup>{accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>{account.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel>归属类型</FieldLabel><Select items={[{ value: 'edge', label: '边缘' }, { value: 'cluster', label: '集群' }]} value={targetType} onValueChange={(value) => { setTargetType((value ?? 'edge') as 'edge' | 'cluster'); setTargetUuid('') }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="edge">边缘</SelectItem><SelectItem value="cluster">集群</SelectItem></SelectGroup></SelectContent></Select></Field><Field><FieldLabel>{targetType === 'edge' ? '边缘' : '集群'}</FieldLabel><Select items={targets.map((target) => ({ value: target.uuid, label: target.name }))} value={targetUuid || null} onValueChange={(value) => setTargetUuid(value ?? '')}><SelectTrigger className="w-full"><SelectValue placeholder={`请选择${targetType === 'edge' ? '边缘' : '集群'}`} /></SelectTrigger><SelectContent><SelectGroup>{targets.map((target) => <SelectItem key={target.uuid} value={target.uuid}>{target.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field></div>
            <Field><FieldTitle>标签</FieldTitle><div className="grid max-h-52 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">{(options.data?.tags ?? []).length ? options.data?.tags.map((tag) => <FieldLabel key={tag.uuid} className="cursor-pointer"><Field orientation="horizontal"><Checkbox checked={tagUuids.has(tag.uuid)} onCheckedChange={(checked) => { const next = new Set(tagUuids); if (checked) next.add(tag.uuid); else next.delete(tag.uuid); setTagUuids(next) }} /><FieldTitle>{tag.name}</FieldTitle></Field></FieldLabel>) : <p className="text-sm text-muted-foreground">当前平台账户没有可用标签</p>}</div><FieldDescription>直接勾选多个标签；不选择则不绑定标签。</FieldDescription></Field>
            {eip ? <Field><FieldLabel htmlFor="axisnow-eip-address">EIP 地址</FieldLabel><Input id="axisnow-eip-address" value={address} onChange={(event) => setAddress(event.target.value)} /></Field> : <Field><FieldLabel htmlFor="axisnow-eip-addresses">EIP 地址</FieldLabel><Textarea id="axisnow-eip-addresses" rows={6} value={addresses} onChange={(event) => setAddresses(event.target.value)} placeholder="每行一个；支持 IP、IP 范围或 CIDR" /><FieldDescription>单次最多展开 1000 个地址。</FieldDescription></Field>}
          </FieldGroup>{options.isError ? <QueryError error={options.error} retry={() => void options.refetch()} /> : null}</div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button><Button type="submit" disabled={save.isPending || !accountId || !targetUuid || !(eip ? address.trim() : addresses.trim())}>{save.isPending ? <Spinner data-icon="inline-start" /> : null}确认</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
