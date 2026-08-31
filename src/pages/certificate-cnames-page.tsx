import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2Icon, CopyIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react'

import { apiDelete, apiGet, apiPost, apiPut } from '@/api/client'
import type { CertificateCnameProxy, DataResponse, OperationResult, PageResponse } from '@/api/types'
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { formatDateTime } from '@/lib/format'

type CnameForm = { domains: Array<{ id: number; name: string }> }
type CnameCheck = { status: 'verified' | 'unverified' }

function automaticRecordName(domain: string) {
  const value = domain.trim()
  return value ? `${value.replaceAll('.', '-')}.cname` : ''
}

function CopyCode({ value, label }: { value: string; label: string }) {
  return <div className="flex min-w-0 items-center gap-1"><code className="min-w-0 flex-1 break-all">{value}</code><Button size="icon-sm" variant="ghost" aria-label={`复制${label}`} onClick={() => { void navigator.clipboard.writeText(value); toast.add({ title: `${label}已复制`, type: 'success' }) }}><CopyIcon /></Button></div>
}

export function CertificateCnamesPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [queryText, setQueryText] = useState('')
  const [sort, setSort] = useState('id')
  const [order, setOrder] = useState('desc')
  const form = useQuery({ queryKey: ['certificate-cnames-form'], queryFn: async () => (await apiGet<DataResponse<CnameForm>>('/api/web/v1/certificate-cnames/form')).data })
  const query = useQuery({ queryKey: ['certificate-cnames', page, queryText, sort, order], queryFn: () => apiGet<PageResponse<CertificateCnameProxy>>('/api/web/v1/certificate-cnames', { page, pageSize: 20, q: queryText, sort, order }) })
  const save = useApiMutation<{ id?: number; body: Record<string, unknown> }, DataResponse<OperationResult>>({ mutationFn: ({ id, body }) => id ? apiPut(`/api/web/v1/certificate-cnames/${id}`, body) : apiPost('/api/web/v1/certificate-cnames', body), successMessage: (_, variables) => variables.id ? 'CNAME 代理已更新' : 'CNAME 代理已添加', invalidate: [['certificate-cnames']] })
  const remove = useApiMutation<number, DataResponse<OperationResult>>({ mutationFn: (id) => apiDelete(`/api/web/v1/certificate-cnames/${id}`), successMessage: 'CNAME 代理已删除', invalidate: [['certificate-cnames']] })
  const check = useApiMutation<number, DataResponse<CnameCheck>>({ mutationFn: (id) => apiPost(`/api/web/v1/certificate-cnames/${id}/check`, {}), successMessage: (result) => result.data.status === 'verified' ? 'CNAME 验证已通过' : 'CNAME 验证未通过，请确认解析记录', invalidate: [['certificate-cnames']] })
  const domainOptions = (form.data?.domains ?? []).map((domain) => ({ value: String(domain.id), label: domain.name }))
  const editFields = [{ name: 'targetDomainId', label: '目标域名', kind: 'select' as const, options: domainOptions, required: true }, { name: 'targetRecordName', label: '目标主机记录', placeholder: '_acme-challenge', required: true }]
  const columns: DataColumn<CertificateCnameProxy>[] = [
    { key: 'domain', label: '证书域名', render: (item) => <div className="min-w-56"><p className="font-medium">{item.domain}</p><CopyCode value={item.challengeHost} label="主机记录" /></div> },
    { key: 'target', label: 'CNAME 目标', render: (item) => <div className="min-w-56"><CopyCode value={item.target} label="CNAME 记录值" /><p className="text-xs text-muted-foreground">{item.targetRecordName}.{item.targetDomain}</p></div> },
    { key: 'status', label: '验证状态', render: (item) => <StatusBadge value={item.status} /> },
    { key: 'time', label: '添加时间', render: (item) => formatDateTime(item.addedAt) },
    { key: 'actions', label: '', className: 'w-12', render: (item) => <DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`管理 ${item.domain}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><FormDialog trigger={<DropdownMenuItem closeOnClick={false}><PencilIcon />编辑</DropdownMenuItem>} title="编辑 CNAME 代理" fields={editFields} initialValues={{ targetDomainId: String(item.targetDomainId), targetRecordName: item.targetRecordName }} pending={save.isPending} onSubmit={(values, close) => save.mutate({ id: item.id, body: { targetDomainId: Number(values.targetDomainId), targetRecordName: values.targetRecordName } }, { onSuccess: close })} /><DropdownMenuItem onClick={() => check.mutate(item.id)}><CheckCircle2Icon />立即验证</DropdownMenuItem><ConfirmAction trigger={<DropdownMenuItem variant="destructive" closeOnClick={false}><Trash2Icon />删除</DropdownMenuItem>} title="删除 CNAME 代理？" description={item.domain} destructive pending={remove.isPending} onConfirm={() => remove.mutate(item.id)} /></DropdownMenuGroup></DropdownMenuContent></DropdownMenu> },
  ]
  return <div className="flex flex-col gap-6"><PageHeader eyebrow="Certificates" title="CNAME 代理" description="为无法直接写入 DNS 的证书域名代理 ACME 验证记录。" action={<FormDialog trigger={<Button><PlusIcon data-icon="inline-start" />添加代理</Button>} title="添加 CNAME 代理" initialValues={{ domain: '', targetDomainId: domainOptions[0]?.value ?? '', targetRecordName: '' }} pending={save.isPending} onSubmit={(values, close) => save.mutate({ body: { domain: values.domain, targetDomainId: Number(values.targetDomainId), targetRecordName: values.targetRecordName } }, { onSuccess: close })}>{(values, onChange) => <FieldGroup><Field><FieldLabel htmlFor="cname-domain">证书域名</FieldLabel><Input id="cname-domain" value={String(values.domain ?? '')} placeholder="example.com" required onChange={(event) => { const previous = String(values.domain ?? ''); const currentRecord = String(values.targetRecordName ?? ''); const domain = event.target.value; onChange({ ...values, domain, targetRecordName: !currentRecord || currentRecord === automaticRecordName(previous) ? automaticRecordName(domain) : currentRecord }) }} /></Field><Field><FieldLabel>目标域名</FieldLabel><Select items={domainOptions} value={String(values.targetDomainId ?? '') || null} onValueChange={(value) => onChange({ ...values, targetDomainId: value ?? '' })}><SelectTrigger className="w-full"><SelectValue placeholder="请选择目标域名" /></SelectTrigger><SelectContent><SelectGroup>{domainOptions.map((domain) => <SelectItem key={domain.value} value={domain.value}>{domain.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel htmlFor="cname-record">目标主机记录</FieldLabel><Input id="cname-record" value={String(values.targetRecordName ?? '')} required onChange={(event) => onChange({ ...values, targetRecordName: event.target.value })} /></Field></FieldGroup>}</FormDialog>} /><Card><CardContent className="flex flex-col gap-4 pt-6"><form className="grid gap-2 md:grid-cols-[minmax(14rem,1fr)_12rem_8rem_auto]" onSubmit={(event) => { event.preventDefault(); setPage(1); setQueryText(search.trim()) }}><div className="relative"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索证书域名" /></div><Select items={[{ value: 'id', label: '按添加顺序' }, { value: 'domain', label: '按证书域名' }, { value: 'status', label: '按验证状态' }, { value: 'addedAt', label: '按添加时间' }]} value={sort} onValueChange={(value) => { setSort(value ?? 'id'); setPage(1) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="id">按添加顺序</SelectItem><SelectItem value="domain">按证书域名</SelectItem><SelectItem value="status">按验证状态</SelectItem><SelectItem value="addedAt">按添加时间</SelectItem></SelectGroup></SelectContent></Select><Select items={[{ value: 'desc', label: '降序' }, { value: 'asc', label: '升序' }]} value={order} onValueChange={(value) => { setOrder(value ?? 'desc'); setPage(1) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="desc">降序</SelectItem><SelectItem value="asc">升序</SelectItem></SelectGroup></SelectContent></Select><Button type="submit" variant="outline">搜索</Button></form>{form.isError ? <QueryError error={form.error} retry={() => void form.refetch()} /> : null}{query.isError ? <QueryError error={query.error} retry={() => void query.refetch()} /> : query.isPending ? <LoadingTable /> : <DataTable rows={query.data.data} columns={columns} rowKey={(item) => String(item.id)} emptyTitle="暂无 CNAME 代理" />}{query.data ? <ListPagination meta={query.data.meta} onPageChange={setPage} /> : null}</CardContent></Card></div>
}
