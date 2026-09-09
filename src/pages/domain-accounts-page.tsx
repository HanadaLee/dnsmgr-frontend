import { useEffect, useState, type ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CloudIcon, Globe2Icon, KeyRoundIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { apiDelete, apiGet, apiPost, apiPut } from '@/api/client'
import type { DataResponse, DnsProviderDefinition, DomainAccountDetail, DomainAccountSummary, OperationResult, PageResponse } from '@/api/types'
import { ConfirmAction } from '@/components/confirm-action'
import { DataTable, type DataColumn } from '@/components/data-table'
import { defaultsForFields, DynamicFields } from '@/components/dynamic-fields'
import { ListPagination } from '@/components/list-pagination'
import { LoadingTable } from '@/components/loading-table'
import { QueryError } from '@/components/query-error'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { formatDateTime } from '@/lib/format'

export function DomainAccountsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [queryText, setQueryText] = useState('')
  const [sort, setSort] = useState('id')
  const [order, setOrder] = useState('desc')
  const accounts = useQuery({
    queryKey: ['domain-accounts', page, queryText, sort, order],
    queryFn: () => apiGet<PageResponse<DomainAccountSummary>>('/api/web/v1/domain-accounts', { page, pageSize: 20, q: queryText, sort, order }),
  })
  const providers = useQuery({
    queryKey: ['domain-account-providers'],
    queryFn: async () => (await apiGet<DataResponse<DnsProviderDefinition[]>>('/api/web/v1/domain-account-providers')).data,
  })
  const remove = useApiMutation<number, DataResponse<OperationResult>>({
    mutationFn: (id) => apiDelete(`/api/web/v1/domain-accounts/${id}`),
    successMessage: '域名账户已删除', invalidate: [['domain-accounts'], ['domains']],
  })

  const columns: DataColumn<DomainAccountSummary>[] = [
    { key: 'name', label: '账户', render: (account) => <div className="min-w-48"><p className="font-medium">{account.name}</p><p className="text-xs text-muted-foreground">{account.remark ?? '暂无备注'}</p></div> },
    { key: 'provider', label: '服务商', render: (account) => <span>{account.provider.label}</span> },
    { key: 'time', label: '添加时间', render: (account) => formatDateTime(account.addedAt) },
    {
      key: 'actions', label: '', className: 'w-12', render: (account) => (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`管理 ${account.name}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuGroup>
            <DropdownMenuItem render={<Link to={`/domains?accountId=${account.id}`} />}><Globe2Icon />查看域名</DropdownMenuItem>
            {account.provider.type.toLowerCase() === 'cloudflare' ? <DropdownMenuItem render={<Link to={`/cloudflare?tab=tunnels&accountId=${account.id}`} />}><CloudIcon />管理 Tunnel</DropdownMenuItem> : null}
            <AccountDialog trigger={<DropdownMenuItem closeOnClick={false}><PencilIcon />编辑</DropdownMenuItem>} account={account} providers={providers.data ?? []} />
            <ConfirmAction
              trigger={<DropdownMenuItem variant="destructive" closeOnClick={false}><Trash2Icon />删除</DropdownMenuItem>}
              title={`删除 ${account.name}？`} description="仅无关联域名的账户可以删除，此操作无法撤销。" destructive pending={remove.isPending} onConfirm={() => remove.mutate(account.id)}
            />
          </DropdownMenuGroup></DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end"><AccountDialog trigger={<Button><PlusIcon data-icon="inline-start" />添加账户</Button>} providers={providers.data ?? []} /></div>
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <form className="grid gap-2 md:grid-cols-[minmax(14rem,1fr)_12rem_8rem_auto]" onSubmit={(event) => { event.preventDefault(); setPage(1); setQueryText(search.trim()) }}>
            <div className="relative flex-1"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索账户名称" /></div>
            <Select items={[{ value: 'id', label: '按添加顺序' }, { value: 'provider', label: '按服务商' }, { value: 'name', label: '按账户名称' }, { value: 'remark', label: '按备注' }, { value: 'addedAt', label: '按添加时间' }]} value={sort} onValueChange={(value) => { setSort(value ?? 'id'); setPage(1) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="id">按添加顺序</SelectItem><SelectItem value="provider">按服务商</SelectItem><SelectItem value="name">按账户名称</SelectItem><SelectItem value="remark">按备注</SelectItem><SelectItem value="addedAt">按添加时间</SelectItem></SelectGroup></SelectContent></Select>
            <Select items={[{ value: 'desc', label: '降序' }, { value: 'asc', label: '升序' }]} value={order} onValueChange={(value) => { setOrder(value ?? 'desc'); setPage(1) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="desc">降序</SelectItem><SelectItem value="asc">升序</SelectItem></SelectGroup></SelectContent></Select>
            <Button type="submit" variant="outline">搜索</Button>
          </form>
          {providers.isError ? <QueryError error={providers.error} retry={() => void providers.refetch()} /> : null}
          {accounts.isError ? <QueryError error={accounts.error} retry={() => void accounts.refetch()} /> : accounts.isPending ? <LoadingTable /> : <DataTable rows={accounts.data.data} columns={columns} rowKey={(account) => String(account.id)} emptyTitle="暂无域名账户" emptyDescription="添加服务商账户后即可接入域名。" />}
          {accounts.data ? <ListPagination meta={accounts.data.meta} onPageChange={setPage} /> : null}
        </CardContent>
      </Card>
    </div>
  )
}

function AccountDialog({ trigger, account, providers }: { trigger: ReactElement; account?: DomainAccountSummary; providers: DnsProviderDefinition[] }) {
  const [open, setOpen] = useState(false)
  const [providerType, setProviderType] = useState('')
  const [name, setName] = useState('')
  const [remark, setRemark] = useState('')
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const detail = useQuery({
    queryKey: ['domain-account', account?.id],
    queryFn: async () => (await apiGet<DataResponse<DomainAccountDetail>>(`/api/web/v1/domain-accounts/${account?.id}`)).data,
    enabled: open && Boolean(account),
  })
  const mutation = useApiMutation<Record<string, unknown>, DataResponse<OperationResult>>({
    mutationFn: (body) => account ? apiPut(`/api/web/v1/domain-accounts/${account.id}`, body) : apiPost('/api/web/v1/domain-accounts', body),
    successMessage: account ? '域名账户已更新' : '域名账户已添加', invalidate: [['domain-accounts'], ['domain-account-providers']],
  })
  const provider = providers.find((item) => item.type === providerType)

  useEffect(() => {
    if (!open) return
    if (!account) {
      const first = providers[0]
      setProviderType(first?.type ?? '')
      setName('')
      setRemark('')
      setConfig(first ? defaultsForFields(first.fields) : {})
    }
  }, [account, open, providers])

  useEffect(() => {
    if (!detail.data) return
    setProviderType(detail.data.provider.type)
    setName(detail.data.name)
    setRemark(detail.data.remark ?? '')
    setConfig(detail.data.config)
  }, [detail.data])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        <form onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate({ providerType, name, config, remark: remark || null }, { onSuccess: () => setOpen(false) })
        }}>
          <DialogHeader><DialogTitle>{account ? '编辑域名账户' : '添加域名账户'}</DialogTitle><DialogDescription>凭据会在服务端验证后保存，敏感字段不会出现在账户列表中。</DialogDescription></DialogHeader>
          <div className="py-5">
            {detail.isPending && account ? <LoadingTable rows={3} /> : (
              <FieldGroup>
                <Field><FieldLabel>服务商</FieldLabel><Select items={providers.map((item) => ({ value: item.type, label: item.label }))} value={providerType || null} disabled={Boolean(account)} onValueChange={(value) => { const next = value ?? ''; setProviderType(next); const definition = providers.find((item) => item.type === next); setConfig(definition ? defaultsForFields(definition.fields) : {}) }}><SelectTrigger className="w-full"><SelectValue placeholder="请选择服务商" /></SelectTrigger><SelectContent><SelectGroup>{providers.map((item) => <SelectItem key={item.type} value={item.type}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
                <Field><FieldLabel htmlFor="account-name">账户名称</FieldLabel><Input id="account-name" value={name} required onChange={(event) => setName(event.target.value)} /></Field>
                {provider?.note ? <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground"><KeyRoundIcon className="mr-2 inline" />{provider.note}</p> : null}
                {provider ? <DynamicFields fields={provider.fields} values={config} onChange={setConfig} /> : null}
                <Field><FieldLabel htmlFor="account-remark">备注</FieldLabel><Textarea id="account-remark" value={remark} onChange={(event) => setRemark(event.target.value)} /></Field>
              </FieldGroup>
            )}
            {detail.isError ? <QueryError error={detail.error} retry={() => void detail.refetch()} /> : null}
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button><Button type="submit" disabled={mutation.isPending || !providerType || !name}>{mutation.isPending ? <Spinner data-icon="inline-start" /> : null}保存</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
