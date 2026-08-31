import { useEffect, useState, type ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MoreHorizontalIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react'

import { apiDelete, apiGet, apiPost, apiPut } from '@/api/client'
import type { CertificateAccountDetail, CertificateAccountKind, CertificateAccountSummary, CertificateAccountTypeDefinition, DataResponse, OperationResult, PageResponse } from '@/api/types'
import { ConfirmAction } from '@/components/confirm-action'
import { DataTable, type DataColumn } from '@/components/data-table'
import { defaultsForFields, DynamicFields } from '@/components/dynamic-fields'
import { ListPagination } from '@/components/list-pagination'
import { LoadingTable } from '@/components/loading-table'
import { PageHeader } from '@/components/page-header'
import { QueryError } from '@/components/query-error'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { formatDateTime } from '@/lib/format'

export function CertificateAccountsPage() {
  const [kind, setKind] = useState<CertificateAccountKind>('issuance')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [queryText, setQueryText] = useState('')
  const [sort, setSort] = useState('id')
  const [order, setOrder] = useState('desc')
  const accounts = useQuery({ queryKey: ['certificate-accounts', kind, page, queryText, sort, order], queryFn: () => apiGet<PageResponse<CertificateAccountSummary>>('/api/web/v1/certificate-accounts', { kind, page, pageSize: 20, q: queryText, sort, order }) })
  const types = useQuery({ queryKey: ['certificate-account-types', kind], queryFn: async () => (await apiGet<DataResponse<CertificateAccountTypeDefinition[]>>('/api/web/v1/certificate-account-types', { kind })).data })
  const remove = useApiMutation<CertificateAccountSummary, DataResponse<OperationResult>>({ mutationFn: (account) => apiDelete(`/api/web/v1/certificate-accounts/${account.id}`, undefined, { kind: account.kind }), successMessage: '证书账户已删除', invalidate: [['certificate-accounts'], ['certificate-orders-form'], ['certificate-deployments-form']] })
  const columns: DataColumn<CertificateAccountSummary>[] = [
    { key: 'name', label: '账户', render: (account) => <div className="min-w-48"><p className="font-medium">{account.name}</p><p className="text-xs text-muted-foreground">{account.remark ?? '暂无备注'}</p></div> },
    { key: 'type', label: '类型', render: (account) => <Badge variant="outline">{account.typeLabel}</Badge> },
    { key: 'time', label: '添加时间', render: (account) => formatDateTime(account.addedAt) },
    { key: 'actions', label: '', className: 'w-12', render: (account) => <DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`管理 ${account.name}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><CertificateAccountDialog trigger={<DropdownMenuItem onClick={(event) => event.preventDefault()}><PencilIcon />编辑</DropdownMenuItem>} account={account} types={types.data ?? []} /><ConfirmAction trigger={<DropdownMenuItem variant="destructive" onClick={(event) => event.preventDefault()}><Trash2Icon />删除</DropdownMenuItem>} title={`删除 ${account.name}？`} description="仅没有关联订单或部署任务的账户可以删除。" destructive pending={remove.isPending} onConfirm={() => remove.mutate(account)} /></DropdownMenuGroup></DropdownMenuContent></DropdownMenu> },
  ]
  return <div className="flex flex-col gap-6"><PageHeader eyebrow="Certificates" title="证书账户" description="管理证书签发与自动部署所需的服务商账户。" action={<CertificateAccountDialog trigger={<Button><PlusIcon data-icon="inline-start" />添加账户</Button>} kind={kind} types={types.data ?? []} />} /><Tabs value={kind} onValueChange={(value) => { setKind(value as CertificateAccountKind); setPage(1) }}><TabsList variant="line"><TabsTrigger value="issuance">签发账户</TabsTrigger><TabsTrigger value="deployment">部署账户</TabsTrigger></TabsList></Tabs><Card><CardContent className="flex flex-col gap-4 pt-6"><form className="grid gap-2 md:grid-cols-[minmax(14rem,1fr)_12rem_8rem_auto]" onSubmit={(event) => { event.preventDefault(); setPage(1); setQueryText(search.trim()) }}><div className="relative"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索账户名称或备注" /></div><Select items={[{ value: 'id', label: '按添加顺序' }, { value: 'type', label: '按账户类型' }, { value: 'name', label: '按账户名称' }, { value: 'remark', label: '按备注' }, { value: 'addedAt', label: '按添加时间' }]} value={sort} onValueChange={(value) => { setSort(value ?? 'id'); setPage(1) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="id">按添加顺序</SelectItem><SelectItem value="type">按账户类型</SelectItem><SelectItem value="name">按账户名称</SelectItem><SelectItem value="remark">按备注</SelectItem><SelectItem value="addedAt">按添加时间</SelectItem></SelectGroup></SelectContent></Select><Select items={[{ value: 'desc', label: '降序' }, { value: 'asc', label: '升序' }]} value={order} onValueChange={(value) => { setOrder(value ?? 'desc'); setPage(1) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="desc">降序</SelectItem><SelectItem value="asc">升序</SelectItem></SelectGroup></SelectContent></Select><Button type="submit" variant="outline">搜索</Button></form>{types.isError ? <QueryError error={types.error} retry={() => void types.refetch()} /> : null}{accounts.isError ? <QueryError error={accounts.error} retry={() => void accounts.refetch()} /> : accounts.isPending ? <LoadingTable /> : <DataTable rows={accounts.data.data} columns={columns} rowKey={(account) => String(account.id)} emptyTitle={kind === 'issuance' ? '暂无签发账户' : '暂无部署账户'} />}{accounts.data ? <ListPagination meta={accounts.data.meta} onPageChange={setPage} /> : null}</CardContent></Card></div>
}

function CertificateAccountDialog({ trigger, account, kind = 'issuance', types }: { trigger: ReactElement; account?: CertificateAccountSummary; kind?: CertificateAccountKind; types: CertificateAccountTypeDefinition[] }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('')
  const [name, setName] = useState('')
  const [remark, setRemark] = useState('')
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const currentKind = account?.kind ?? kind
  const detail = useQuery({ queryKey: ['certificate-account', account?.id, currentKind], queryFn: async () => (await apiGet<DataResponse<CertificateAccountDetail>>(`/api/web/v1/certificate-accounts/${account?.id}`, { kind: currentKind })).data, enabled: open && Boolean(account) })
  const mutation = useApiMutation<Record<string, unknown>, DataResponse<OperationResult>>({ mutationFn: (body) => account ? apiPut(`/api/web/v1/certificate-accounts/${account.id}`, body) : apiPost('/api/web/v1/certificate-accounts', body), successMessage: account ? '证书账户已更新' : '证书账户已添加', invalidate: [['certificate-accounts'], ['certificate-orders-form'], ['certificate-deployments-form']] })
  const definition = types.find((item) => item.type === type)
  useEffect(() => { if (!open || account) return; const first = types[0]; setType(first?.type ?? ''); setName(''); setRemark(''); setConfig(first ? defaultsForFields(first.fields) : {}) }, [account, open, types])
  useEffect(() => { if (!detail.data) return; setType(detail.data.type); setName(detail.data.name); setRemark(detail.data.remark ?? ''); setConfig(detail.data.config) }, [detail.data])
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={trigger} /><DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl"><form onSubmit={(event) => { event.preventDefault(); mutation.mutate({ kind: currentKind, type, name, config, remark: remark || null }, { onSuccess: () => setOpen(false) }) }}><DialogHeader><DialogTitle>{account ? '编辑证书账户' : `添加${currentKind === 'issuance' ? '签发' : '部署'}账户`}</DialogTitle><DialogDescription>根据账户类型填写所需配置，保存时会验证配置是否可用。</DialogDescription></DialogHeader><div className="py-5"><FieldGroup><Field><FieldLabel>账户类型</FieldLabel><Select items={types.map((item) => ({ value: item.type, label: item.label }))} value={type || null} disabled={Boolean(account)} onValueChange={(value) => { const next = value ?? ''; setType(next); const selected = types.find((item) => item.type === next); setConfig(selected ? defaultsForFields(selected.fields) : {}) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{types.map((item) => <SelectItem key={item.type} value={item.type}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>{type !== 'local' ? <Field><FieldLabel htmlFor="cert-account-name">账户名称</FieldLabel><Input id="cert-account-name" value={name} required onChange={(event) => setName(event.target.value)} /></Field> : null}{definition?.description ? <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{definition.description}</p> : null}{definition ? <DynamicFields fields={definition.fields} values={config} onChange={setConfig} /> : null}<Field><FieldLabel htmlFor="cert-account-remark">备注</FieldLabel><Textarea id="cert-account-remark" value={remark} onChange={(event) => setRemark(event.target.value)} /></Field></FieldGroup>{detail.isError ? <QueryError error={detail.error} retry={() => void detail.refetch()} /> : null}</div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button><Button type="submit" disabled={mutation.isPending || !type}>{mutation.isPending ? <Spinner data-icon="inline-start" /> : null}保存</Button></DialogFooter></form></DialogContent></Dialog>
}
