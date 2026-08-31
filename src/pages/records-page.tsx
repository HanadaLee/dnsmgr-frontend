import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  CloudIcon,
  CopyIcon,
  ExternalLinkIcon,
  Layers3Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { apiDelete, apiGet, apiGetAll, apiPatch, apiPost, apiPut } from '@/api/client'
import type { DataResponse, DnsRecord, DomainAlias, DomainRecordLog, DomainSummary, OperationResult, PageResponse, RecordCheckResult, RecordGroup, RecordOptions } from '@/api/types'
import { useSession } from '@/auth/session-context'
import { ConfirmAction } from '@/components/confirm-action'
import { DataTable, type DataColumn } from '@/components/data-table'
import { FormDialog } from '@/components/form-dialog'
import { ListPagination } from '@/components/list-pagination'
import { LoadingTable } from '@/components/loading-table'
import { PageHeader } from '@/components/page-header'
import { QueryError } from '@/components/query-error'
import { QingCloudRecords } from '@/components/qingcloud-records'
import { RecordExcelTools } from '@/components/record-excel-tools'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { formatDateTime } from '@/lib/format'

type WeightedRecordSet = { id: string; lookupName: string; subdomain: string; type: string; recordCount: number; enabled: boolean; lineAlgorithms: Array<{ lineId: string; enabled: boolean }> }

const groupSelectValue = (id: string) => `group:${encodeURIComponent(id)}`
const groupIdFromSelect = (value: unknown) => {
  const text = String(value ?? '')
  return text.startsWith('group:') ? decodeURIComponent(text.slice('group:'.length)) : text
}

const checkableRecordTypes = new Set(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'SRV', 'CAA', 'PTR', 'LOC', 'LUA', 'REDIRECT_URL', 'FORWARD_URL'])
const visitableRecordTypes = new Set(['A', 'AAAA', 'CNAME', 'REDIRECT_URL', 'FORWARD_URL'])

function recordTypeLabel(type: string) {
  if (type === 'REDIRECT_URL') return '显性 URL'
  if (type === 'FORWARD_URL') return '隐性 URL'
  return type
}

function recordVisitUrl(record: DnsRecord, domainName: string) {
  const hostname = (record.name === '@' ? domainName : `${record.name}.${domainName}`).replaceAll('*', 'www')
  return `http://${hostname}`
}

function snapshot(record: DnsRecord) {
  return { id: record.id, name: record.name, type: record.type, value: record.value, values: record.values, lineId: record.line.id, ttl: record.ttl ?? 600, mxPriority: record.mxPriority ?? 1, weight: record.weight ?? 0, mode: record.mode, parentId: record.parentId, remark: record.remark ?? null }
}

function recordFields(options?: RecordOptions) {
  return [
    { name: 'name', label: '主机记录', placeholder: '@ 或 www', required: true },
    { name: 'type', label: '记录类型', kind: 'select' as const, options: (options?.recordTypes ?? ['A', 'AAAA', 'CNAME', 'TXT']).map((value) => ({ value, label: value })), required: true },
    { name: 'value', label: '记录值', kind: 'textarea' as const, required: true },
    { name: 'lineId', label: '解析线路', kind: 'select' as const, options: (options?.lines ?? []).map((line) => ({ value: line.id, label: line.parent ? `${line.parent} / ${line.label}` : line.label })), required: true },
    { name: 'ttl', label: 'TTL', kind: 'number' as const, min: options?.minTtl ?? 1, required: true },
    { name: 'mxPriority', label: 'MX 优先级', kind: 'number' as const, min: 0, max: 65535, visible: (values: Record<string, unknown>) => values.type === 'MX' },
    { name: 'mode', label: '解析模式', kind: 'select' as const, options: (values: Record<string, unknown>) => values.type === 'CNAME' ? [{ value: '1', label: '普通' }, { value: '3', label: '权重' }] : [{ value: '1', label: '普通' }, { value: '2', label: '轮询' }, { value: '4', label: '智能' }, { value: '3', label: '权重' }], visible: (values: Record<string, unknown>) => Boolean(options?.capabilities.hierarchicalRecords) && (values.type === 'A' || values.type === 'CNAME') },
    { name: 'weight', label: '权重', kind: 'number' as const, min: options?.capabilities.hierarchicalRecords ? 1 : 0, max: options?.capabilities.hierarchicalRecords ? 99 : 100, visible: (values: Record<string, unknown>) => options?.capabilities.hierarchicalRecords ? (values.type === 'A' || values.type === 'CNAME') && Number(values.mode) === 3 : Boolean(options?.capabilities.recordWeight) },
    { name: 'remark', label: '备注', kind: 'textarea' as const, visible: () => options?.capabilities.recordRemark === 'inline' },
  ]
}

function recordPayload(values: Record<string, unknown>) {
  const type = String(values.type ?? '')
  return {
    ...values,
    ttl: Number(values.ttl),
    mxPriority: Number(values.mxPriority ?? 1),
    weight: Number(values.weight ?? 0),
    mode: (type === 'A' || type === 'CNAME') && values.mode ? Number(values.mode) : undefined,
    remark: String(values.remark ?? '') || null,
  }
}

function RecordsContent({ domainId }: { domainId: number }) {
  const session = useSession()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [queryText, setQueryText] = useState('')
  const [searchBy, setSearchBy] = useState('keyword')
  const [typeFilter, setTypeFilter] = useState('all')
  const [lineFilter, setLineFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort] = useState('name')
  const [order, setOrder] = useState('asc')
  const [logPage, setLogPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const domain = useQuery({ queryKey: ['domain', domainId], queryFn: async () => (await apiGet<DataResponse<DomainSummary>>(`/api/web/v1/domains/${domainId}`)).data })
  const options = useQuery({ queryKey: ['record-options', domainId], queryFn: async () => (await apiGet<DataResponse<RecordOptions>>(`/api/web/v1/domains/${domainId}/record-options`)).data })
  const records = useQuery({
    queryKey: ['records', domainId, page, queryText, searchBy, typeFilter, lineFilter, groupFilter, statusFilter, sort, order],
    queryFn: () => apiGet<PageResponse<DnsRecord>>(`/api/web/v1/domains/${domainId}/records`, { page, pageSize: 20, q: searchBy === 'keyword' ? queryText : undefined, subdomain: searchBy === 'subdomain' ? queryText : undefined, value: searchBy === 'value' ? queryText : undefined, type: typeFilter === 'all' ? undefined : typeFilter, line: lineFilter === 'all' ? undefined : lineFilter, groupId: groupFilter === 'all' ? undefined : groupIdFromSelect(groupFilter), status: statusFilter === 'all' ? undefined : statusFilter, sort, order }),
    enabled: options.isSuccess && !options.data.capabilities.hierarchicalRecords,
  })
  const groups = useQuery({
    queryKey: ['record-groups', domainId],
    queryFn: async () => (await apiGet<DataResponse<RecordGroup[]>>(`/api/web/v1/domains/${domainId}/record-groups`)).data,
    enabled: Boolean(options.data?.capabilities.recordGroups),
  })
  const aliases = useQuery({
    queryKey: ['domain-aliases', domainId],
    queryFn: async () => (await apiGet<DataResponse<DomainAlias[]>>(`/api/web/v1/domains/${domainId}/aliases`)).data,
    enabled: Boolean(options.data?.capabilities.domainAliases),
  })
  const logs = useQuery({
    queryKey: ['record-logs', domainId, logPage],
    queryFn: () => apiGet<PageResponse<DomainRecordLog>>(`/api/web/v1/domains/${domainId}/record-logs`, { page: logPage, pageSize: 20 }),
    enabled: Boolean(options.data?.capabilities.recordLogs),
  })
  const weights = useQuery({
    queryKey: ['weighted-records', domainId],
    queryFn: () => apiGetAll<WeightedRecordSet>(`/api/web/v1/domains/${domainId}/weighted-records`),
    enabled: Boolean(options.data?.capabilities.weightedSets),
  })
  const invalidate = [['records', domainId], ['domain', domainId], ['domains']] as const
  const create = useApiMutation<Record<string, unknown>, DataResponse<OperationResult>>({ mutationFn: (body) => apiPost(`/api/web/v1/domains/${domainId}/records`, body), successMessage: '解析记录已添加', invalidate: [...invalidate] })
  const update = useApiMutation<{ id: string; body: Record<string, unknown> }, DataResponse<OperationResult>>({ mutationFn: ({ id, body }) => apiPatch(`/api/web/v1/domains/${domainId}/records/${encodeURIComponent(id)}`, body), successMessage: '解析记录已更新', invalidate: [...invalidate] })
  const remove = useApiMutation<DnsRecord, DataResponse<OperationResult>>({ mutationFn: (record) => apiDelete(`/api/web/v1/domains/${domainId}/records/${encodeURIComponent(record.id)}`, { current: snapshot(record) }), successMessage: '解析记录已删除', invalidate: [...invalidate] })
  const status = useApiMutation<DnsRecord, DataResponse<OperationResult>>({ mutationFn: (record) => apiPatch(`/api/web/v1/domains/${domainId}/records/${encodeURIComponent(record.id)}/status`, { enabled: record.status !== 'enabled', current: snapshot(record) }), successMessage: '记录状态已更新', invalidate: [...invalidate] })
  const remark = useApiMutation<{ id: string; remark: string | null }, DataResponse<OperationResult>>({ mutationFn: ({ id, remark }) => apiPatch(`/api/web/v1/domains/${domainId}/records/${encodeURIComponent(id)}/remark`, { remark }), successMessage: '记录备注已更新', invalidate: [...invalidate] })
  const check = useApiMutation<DnsRecord, DataResponse<RecordCheckResult>>({ mutationFn: (record) => apiPost(`/api/web/v1/domains/${domainId}/records/${encodeURIComponent(record.id)}/check`, { name: record.name, type: record.type, value: record.values?.[0] ?? record.value }), successMessage: ({ data }) => `${data.message ?? ({ active: '解析结果匹配', mismatch: '解析结果不匹配', not_found: '未查询到解析记录' }[data.status])}${data.actual.length ? ` · 实际值：${data.actual.join('、')}` : ''}` })
  const batch = useApiMutation<Record<string, unknown>, DataResponse<OperationResult>>({ mutationFn: (body) => apiPost(`/api/web/v1/domains/${domainId}/records/batch`, body), successMessage: (result) => result.message ?? '批量操作已完成', invalidate: [...invalidate], onSuccess: () => setSelected(new Set()) })
  const bulk = useApiMutation<Record<string, unknown>, DataResponse<OperationResult>>({ mutationFn: (body) => apiPost(`/api/web/v1/domains/${domainId}/records/bulk`, body), successMessage: (result) => result.message ?? '解析记录已批量添加', invalidate: [...invalidate] })
  const aliasCreate = useApiMutation<string, DataResponse<OperationResult>>({ mutationFn: (name) => apiPost(`/api/web/v1/domains/${domainId}/aliases`, { name }), successMessage: '域名别名已添加', invalidate: [['domain-aliases', domainId]] })
  const aliasDelete = useApiMutation<number, DataResponse<OperationResult>>({ mutationFn: (id) => apiDelete(`/api/web/v1/domains/${domainId}/aliases/${id}`), successMessage: '域名别名已删除', invalidate: [['domain-aliases', domainId]] })
  const weightStatus = useApiMutation<WeightedRecordSet, DataResponse<OperationResult>>({ mutationFn: (item) => apiPatch(`/api/web/v1/domains/${domainId}/weighted-records/status`, { subdomain: item.subdomain, enabled: !item.enabled }), successMessage: (result) => result.message ?? '权重解析状态已更新', invalidate: [['weighted-records', domainId]] })
  const rows = records.data?.data ?? []
  const selectedRecords = rows.filter((record) => selected.has(record.id))
  const defaults = { type: 'A', lineId: options.data?.lines[0]?.id ?? '', ttl: Math.max(600, options.data?.minTtl ?? 1), mxPriority: 1, weight: 1, mode: 1 }
  const columns: DataColumn<DnsRecord>[] = [
    { key: 'name', label: '主机记录', render: (record) => <div className="min-w-32"><code className="font-medium">{record.name}</code><p className="text-xs text-muted-foreground">{record.line.label}</p></div> },
    { key: 'type', label: '类型', render: (record) => <Badge variant="outline">{recordTypeLabel(record.type)}</Badge> },
    { key: 'value', label: '记录值', render: (record) => <div className="flex max-w-md items-center gap-1"><code className="min-w-0 flex-1 truncate" title={record.value}>{record.value}{record.type === 'MX' && options.data?.providerType !== 'huawei' ? ` | ${record.mxPriority ?? 1}` : ''}</code><Button size="icon-sm" variant="ghost" aria-label={`复制 ${record.name} 的记录值`} onClick={() => { void navigator.clipboard.writeText(record.value); toast.add({ title: '记录值已复制', type: 'success' }) }}><CopyIcon /></Button></div> },
    { key: 'ttl', label: 'TTL', render: (record) => record.ttl ?? '—' },
    ...(options.data?.capabilities.recordWeight ? [{ key: 'weight', label: '权重', render: (record: DnsRecord) => record.weight ?? '—' }] : []),
    ...(options.data?.capabilities.recordRemark !== 'none' ? [{ key: 'remark', label: '备注', render: (record: DnsRecord) => record.remark || '—' }] : []),
    { key: 'status', label: '状态', render: (record) => options.data?.capabilities.recordStatus ? <button aria-label={`切换 ${record.name} 状态`} onClick={() => status.mutate(record)}><StatusBadge value={record.status} /></button> : <StatusBadge value={record.status} /> },
    { key: 'updated', label: '更新时间', render: (record) => formatDateTime(record.updatedAt) },
    { key: 'actions', label: '', className: 'w-12', render: (record) => <RecordActions record={record} domainName={domain.data?.name} options={options.data} updatePending={update.isPending} remarkPending={remark.isPending} deletePending={remove.isPending} onUpdate={(body, close) => update.mutate({ id: record.id, body: { ...body, current: snapshot(record) } }, { onSuccess: close })} onRemark={(nextRemark, close) => remark.mutate({ id: record.id, remark: nextRemark }, { onSuccess: close })} onCheck={() => check.mutate(record)} onDelete={() => remove.mutate(record)} /> },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="DNS Records"
        title={domain.data?.name ?? '解析记录'}
        description={`${domain.data?.provider.label ?? ''} · 共 ${records.data?.meta.total ?? domain.data?.recordCount ?? 0} 条解析记录`}
        action={<div className="flex flex-wrap gap-2">{session.user.type !== 'domain' ? <Button variant="outline" nativeButton={false} render={<Link to="/domains" />}><ArrowLeftIcon data-icon="inline-start" />返回域名</Button> : null}{options.data?.capabilities.customHostnames && session.capabilities.domainAccounts ? <Button variant="outline" nativeButton={false} render={<Link to={`/cloudflare?domainId=${domainId}`} />}><CloudIcon data-icon="inline-start" />自定义主机名</Button> : null}<FormDialog trigger={<Button><PlusIcon data-icon="inline-start" />添加记录</Button>} title="添加解析记录" fields={recordFields(options.data)} initialValues={defaults} pending={create.isPending} onSubmit={(values, close) => create.mutate(recordPayload(values), { onSuccess: close })} /></div>}
      />
      {domain.isError ? <QueryError error={domain.error} retry={() => void domain.refetch()} /> : null}
      {options.isError ? <QueryError error={options.error} retry={() => void options.refetch()} /> : null}
      <Tabs defaultValue="records">
        <TabsList variant="line"><TabsTrigger value="records">解析记录</TabsTrigger><TabsTrigger value="advanced">批量与高级</TabsTrigger>{options.data?.capabilities.recordLogs ? <TabsTrigger value="logs">操作日志</TabsTrigger> : null}</TabsList>
        <TabsContent value="records">
          {options.data?.capabilities.hierarchicalRecords ? <QingCloudRecords domainId={domainId} options={options.data} /> : <Card><CardContent className="flex flex-col gap-4 pt-6">
            <form className="grid gap-2 md:grid-cols-2 xl:grid-cols-[9rem_minmax(14rem,1fr)_10rem_12rem_9rem_10rem_8rem_auto]" onSubmit={(event) => { event.preventDefault(); setPage(1); setSelected(new Set()); setQueryText(search.trim()) }}><Select items={[{ value: 'keyword', label: '关键字' }, { value: 'subdomain', label: '主机记录' }, { value: 'value', label: '记录值' }]} value={searchBy} onValueChange={(value) => { setSearchBy(value ?? 'keyword'); setPage(1); setSelected(new Set()) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="keyword">关键字</SelectItem><SelectItem value="subdomain">主机记录</SelectItem><SelectItem value="value">记录值</SelectItem></SelectGroup></SelectContent></Select><div className="relative"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchBy === 'subdomain' ? '输入主机记录' : searchBy === 'value' ? '输入完整记录值' : '输入关键字'} /></div><Select items={[{ value: 'all', label: '全部类型' }, ...(options.data?.recordTypes ?? []).map((value) => ({ value, label: value }))]} value={typeFilter} onValueChange={(value) => { setTypeFilter(value ?? 'all'); setPage(1); setSelected(new Set()) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部类型</SelectItem>{(options.data?.recordTypes ?? []).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectGroup></SelectContent></Select><Select items={[{ value: 'all', label: '全部线路' }, ...(options.data?.lines ?? []).map((line) => ({ value: line.id, label: line.label }))]} value={lineFilter} onValueChange={(value) => { setLineFilter(value ?? 'all'); setPage(1); setSelected(new Set()) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部线路</SelectItem>{(options.data?.lines ?? []).map((line) => <SelectItem key={line.id} value={line.id}>{line.label}</SelectItem>)}</SelectGroup></SelectContent></Select><Select items={[{ value: 'all', label: '全部状态' }, { value: 'enabled', label: '已启用' }, { value: 'disabled', label: '已停用' }]} value={statusFilter} onValueChange={(value) => { setStatusFilter(value ?? 'all'); setPage(1); setSelected(new Set()) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部状态</SelectItem><SelectItem value="enabled">已启用</SelectItem><SelectItem value="disabled">已停用</SelectItem></SelectGroup></SelectContent></Select><Select items={[{ value: 'name', label: '按主机记录' }, { value: 'type', label: '按类型' }, { value: 'line', label: '按线路' }, { value: 'value', label: '按记录值' }, { value: 'updatedAt', label: '按更新时间' }]} value={sort} onValueChange={(value) => { setSort(value ?? 'name'); setPage(1); setSelected(new Set()) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="name">按主机记录</SelectItem><SelectItem value="type">按类型</SelectItem><SelectItem value="line">按线路</SelectItem><SelectItem value="value">按记录值</SelectItem><SelectItem value="updatedAt">按更新时间</SelectItem></SelectGroup></SelectContent></Select><Select items={[{ value: 'asc', label: '升序' }, { value: 'desc', label: '降序' }]} value={order} onValueChange={(value) => { setOrder(value ?? 'asc'); setPage(1); setSelected(new Set()) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="asc">升序</SelectItem><SelectItem value="desc">降序</SelectItem></SelectGroup></SelectContent></Select><Button variant="outline" type="submit">搜索</Button></form>
            {options.data?.capabilities.recordGroups ? <div className="flex items-center gap-3"><span className="text-sm text-muted-foreground">记录分组</span><Select items={[{ value: 'all', label: '全部分组' }, ...(groups.data ?? []).map((group) => ({ value: groupSelectValue(group.id), label: group.name }))]} value={groupFilter} onValueChange={(value) => { setGroupFilter(value ?? 'all'); setPage(1); setSelected(new Set()) }}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部分组</SelectItem>{(groups.data ?? []).map((group) => <SelectItem key={group.id || 'root'} value={groupSelectValue(group.id)}>{group.name}</SelectItem>)}</SelectGroup></SelectContent></Select></div> : null}
            {selected.size ? <BatchToolbar records={selectedRecords} options={options.data} groups={groups.data ?? []} pending={batch.isPending} onBatch={(body, close) => batch.mutate(body, { onSuccess: close })} /> : null}
            {records.isError ? <QueryError error={records.error} retry={() => void records.refetch()} /> : records.isPending ? <LoadingTable /> : <DataTable rows={records.data.data} columns={columns} rowKey={(record) => record.id} selected={selected} onSelectedChange={setSelected} emptyTitle="暂无解析记录" />}
            {records.data ? <ListPagination meta={records.data.meta} onPageChange={(next) => { setSelected(new Set()); setPage(next) }} /> : null}
          </CardContent></Card>}
        </TabsContent>
        <TabsContent value="advanced"><AdvancedRecords domainId={domainId} domainName={domain.data?.name ?? `domain-${domainId}`} options={options.data} groups={groups.data ?? []} aliases={aliases.data ?? []} weights={weights.data ?? []} bulk={bulk} aliasCreate={aliasCreate} aliasDelete={aliasDelete} weightStatus={weightStatus} onImported={() => void records.refetch()} /></TabsContent>
        <TabsContent value="logs"><Card><CardHeader><CardTitle>解析操作日志</CardTitle><CardDescription>解析记录变更历史。</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">{logs.isError ? <QueryError error={logs.error} retry={() => void logs.refetch()} /> : logs.isPending ? <LoadingTable /> : <DataTable rows={logs.data.data} columns={[{ key: 'time', label: '时间', render: (item) => formatDateTime(item.time) }, { key: 'action', label: '操作', render: (item) => item.action }]} rowKey={(item) => `${item.time}-${item.action}`} emptyTitle="暂无操作日志" />}{logs.data ? <ListPagination meta={logs.data.meta} onPageChange={setLogPage} /> : null}</CardContent></Card></TabsContent>
      </Tabs>
    </div>
  )
}

function RecordActions({ record, domainName, options, updatePending, remarkPending, deletePending, onUpdate, onRemark, onCheck, onDelete }: { record: DnsRecord; domainName?: string; options?: RecordOptions; updatePending: boolean; remarkPending: boolean; deletePending: boolean; onUpdate: (body: Record<string, unknown>, close: () => void) => void; onRemark: (remark: string | null, close: () => void) => void; onCheck: () => void; onDelete: () => void }) {
  if (record.name === '@' && (record.type === 'NS' || record.type === 'SOA')) return <span className="text-muted-foreground">—</span>
  return <DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`管理 ${record.name}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup>
    <FormDialog trigger={<DropdownMenuItem onClick={(event) => event.preventDefault()}><PencilIcon />编辑</DropdownMenuItem>} title="编辑解析记录" fields={recordFields(options)} initialValues={{ name: record.name, type: record.type, value: record.value, lineId: record.line.id, ttl: record.ttl ?? 600, mxPriority: record.mxPriority ?? 1, weight: record.weight ?? 0, mode: record.mode ?? 1, remark: record.remark ?? '' }} pending={updatePending} onSubmit={(values, close) => onUpdate(recordPayload(values), close)} />
    {options?.capabilities.recordRemark === 'separate' ? <FormDialog trigger={<DropdownMenuItem onClick={(event) => event.preventDefault()}><PencilIcon />编辑备注</DropdownMenuItem>} title="编辑记录备注" fields={[{ name: 'remark', label: '备注', kind: 'textarea' }]} initialValues={{ remark: record.remark ?? '' }} pending={remarkPending} onSubmit={(values, close) => onRemark(String(values.remark ?? '') || null, close)} /> : null}
    {checkableRecordTypes.has(record.type) ? <DropdownMenuItem onClick={onCheck}><CheckCircle2Icon />检查记录</DropdownMenuItem> : null}
    {domainName && visitableRecordTypes.has(record.type) ? <DropdownMenuItem render={<a href={recordVisitUrl(record, domainName)} target="_blank" rel="noreferrer" />}><ExternalLinkIcon />访问域名</DropdownMenuItem> : null}
    <ConfirmAction trigger={<DropdownMenuItem variant="destructive" onClick={(event) => event.preventDefault()}><Trash2Icon />删除</DropdownMenuItem>} title="删除解析记录？" description={`${record.name} ${record.type} 将被永久删除。`} destructive pending={deletePending} onConfirm={onDelete} />
  </DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
}

function BatchToolbar({ records, options, groups, pending, onBatch }: { records: DnsRecord[]; options?: RecordOptions; groups: RecordGroup[]; pending: boolean; onBatch: (body: Record<string, unknown>, close: () => void) => void }) {
  const snapshots = records.map(snapshot)
  const actions = [
    ...(options?.capabilities.recordStatus ? [{ value: 'status-enable', label: '启用记录' }, { value: 'status-disable', label: '停用记录' }] : []),
    ...(options?.capabilities.recordRemark === 'separate' ? [{ value: 'remark', label: '设置备注' }] : []),
    ...(options?.capabilities.recordGroups ? [{ value: 'group', label: '移动分组' }] : []),
    { value: 'value', label: '修改记录值' }, { value: 'line', label: '修改线路' }, { value: 'delete', label: '删除记录' },
  ]
  const fields = [
    { name: 'action', label: '批量操作', kind: 'select' as const, options: actions, required: true },
    { name: 'remark', label: '备注', kind: 'textarea' as const, visible: (values: Record<string, unknown>) => values.action === 'remark' },
    { name: 'groupId', label: '分组', kind: 'select' as const, options: groups.map((group) => ({ value: groupSelectValue(group.id), label: group.name })), required: true, visible: (values: Record<string, unknown>) => values.action === 'group' },
    { name: 'type', label: '记录类型', kind: 'select' as const, options: (options?.recordTypes ?? []).map((value) => ({ value, label: value })), required: true, visible: (values: Record<string, unknown>) => values.action === 'value' },
    { name: 'value', label: '记录值', kind: 'textarea' as const, required: true, visible: (values: Record<string, unknown>) => values.action === 'value' },
    { name: 'lineId', label: '线路', kind: 'select' as const, options: (options?.lines ?? []).map((line) => ({ value: line.id, label: line.label })), required: true, visible: (values: Record<string, unknown>) => values.action === 'line' },
  ]
  return <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3"><span className="mr-auto text-sm">已选择 {records.length} 条记录</span><FormDialog trigger={<Button size="sm" variant="outline"><Layers3Icon data-icon="inline-start" />批量操作</Button>} title="批量操作解析记录" fields={fields} pending={pending} onSubmit={(values, close) => { const action = String(values.action); const body = action.startsWith('status-') ? { action: 'status', enabled: action === 'status-enable', records: snapshots } : { ...values, action, groupId: action === 'group' ? groupIdFromSelect(values.groupId) : values.groupId, records: snapshots, remark: String(values.remark ?? '') || null }; onBatch(body, close) }} /></div>
}

function AdvancedRecords({ domainId, domainName, options, groups, aliases, weights, bulk, aliasCreate, aliasDelete, weightStatus, onImported }: {
  domainId: number
  domainName: string
  options?: RecordOptions
  groups: RecordGroup[]
  aliases: DomainAlias[]
  weights: WeightedRecordSet[]
  bulk: ReturnType<typeof useApiMutation<Record<string, unknown>, DataResponse<OperationResult>>>
  aliasCreate: ReturnType<typeof useApiMutation<string, DataResponse<OperationResult>>>
  aliasDelete: ReturnType<typeof useApiMutation<number, DataResponse<OperationResult>>>
  weightStatus: ReturnType<typeof useApiMutation<WeightedRecordSet, DataResponse<OperationResult>>>
  onImported: () => void
}) {
  const quickEdit = useApiMutation<Record<string, unknown>, DataResponse<OperationResult>>({ mutationFn: (body) => apiPatch(`/api/web/v1/domains/${domainId}/records/by-name`, body), successMessage: (result) => result.message ?? '匹配的解析记录已更新', invalidate: [['records', domainId]] })
  return <div className="grid gap-4 lg:grid-cols-2">
    {options && !options.capabilities.hierarchicalRecords ? <Card className="lg:col-span-2"><CardHeader><CardTitle>Excel 导入与导出</CardTitle><CardDescription>兼容常用解析记录工作簿列名；导入前先校验并预览，导出会读取当前域名全部记录。</CardDescription></CardHeader><CardContent><RecordExcelTools domainId={domainId} domainName={domainName} options={options} onImported={onImported} /></CardContent></Card> : null}
    <Card><CardHeader><CardTitle>批量添加</CardTitle><CardDescription>每行一条记录，支持批量记录语法。</CardDescription></CardHeader><CardContent><FormDialog trigger={<Button><UploadIcon data-icon="inline-start" />打开批量添加</Button>} title="批量添加解析记录" initialValues={{ type: 'auto', lineId: options?.lines[0]?.id ?? null, ttl: Math.max(600, options?.minTtl ?? 1), mxPriority: 1, proxied: false }} fields={[{ name: 'recordsText', label: '记录内容', kind: 'textarea', description: '每行使用“主机记录 记录值”。', required: true }, { name: 'type', label: '默认类型', kind: 'select', options: [{ value: 'auto', label: '自动识别 A / AAAA / CNAME' }, ...(options?.recordTypes ?? []).map((value) => ({ value, label: value }))] }, { name: 'lineId', label: '默认线路', kind: 'select', options: (options?.lines ?? []).map((line) => ({ value: line.id, label: line.label })) }, { name: 'ttl', label: 'TTL', kind: 'number', min: options?.minTtl ?? 1 }, { name: 'mxPriority', label: 'MX 优先级', kind: 'number', visible: (values) => values.type === 'MX' }, { name: 'remark', label: '备注', visible: () => options?.capabilities.recordRemark !== 'none' }, { name: 'proxied', label: '启用 Cloudflare 代理', kind: 'switch', visible: () => options?.providerType === 'cloudflare' }]} pending={bulk.isPending} onSubmit={(values, close) => bulk.mutate({ ...values, type: values.type === 'auto' ? undefined : values.type, ttl: Number(values.ttl), mxPriority: Number(values.mxPriority), lineId: values.lineId || null, remark: String(values.remark ?? '') || null }, { onSuccess: close })} /></CardContent></Card>
    <Card><CardHeader><CardTitle>按名称快速修改</CardTitle><CardDescription>修改同一主机记录名称下的解析。</CardDescription></CardHeader><CardContent><FormDialog trigger={<Button variant="outline"><PencilIcon data-icon="inline-start" />快速修改</Button>} title="按名称修改记录" initialValues={{ type: 'A', ttl: 0, mxPriority: 0 }} fields={[{ name: 'name', label: '主机记录', required: true }, { name: 'type', label: '记录类型', kind: 'select', options: (options?.recordTypes ?? []).map((value) => ({ value, label: value })), required: true }, { name: 'value', label: '新记录值', kind: 'textarea', required: true }, { name: 'ttl', label: 'TTL（0 表示不变）', kind: 'number', min: 0 }, { name: 'mxPriority', label: 'MX 优先级（0 表示不变）', kind: 'number', min: 0 }]} pending={quickEdit.isPending} onSubmit={(values, close) => quickEdit.mutate({ ...values, ttl: Number(values.ttl), mxPriority: Number(values.mxPriority) }, { onSuccess: close })} /></CardContent></Card>
    {options?.capabilities.recordGroups ? <Card><CardHeader><CardTitle>记录分组</CardTitle><CardDescription>供应商返回的可用分组。</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">{groups.length ? groups.map((group) => <Badge key={group.id} variant="secondary">{group.name} · {group.id}</Badge>) : <p className="text-sm text-muted-foreground">暂无分组</p>}</CardContent></Card> : null}
    {options?.capabilities.domainAliases ? <Card><CardHeader><CardTitle>域名别名</CardTitle><CardDescription>让其他域名复用当前域名解析。</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><FormDialog trigger={<Button size="sm" variant="outline"><PlusIcon data-icon="inline-start" />添加别名</Button>} title="添加域名别名" fields={[{ name: 'name', label: '别名域名', placeholder: 'alias.example.com', required: true }]} pending={aliasCreate.isPending} onSubmit={(values, close) => aliasCreate.mutate(String(values.name), { onSuccess: close })} />{aliases.map((alias) => <div key={alias.id} className="flex items-center gap-3 rounded-lg border p-3"><span className="min-w-0 flex-1 truncate">{alias.name}</span><StatusBadge value={alias.status} /><ConfirmAction trigger={<Button size="icon-sm" variant="ghost" aria-label="删除别名"><Trash2Icon /></Button>} title="删除域名别名？" description={alias.name} destructive pending={aliasDelete.isPending} onConfirm={() => aliasDelete.mutate(alias.id)} /></div>)}</CardContent></Card> : null}
    {options?.capabilities.weightedSets ? <Card className="lg:col-span-2"><CardHeader><CardTitle>权重解析</CardTitle><CardDescription>管理供应商的权重记录集合。</CardDescription></CardHeader><CardContent><DataTable rows={weights} rowKey={(item) => item.id} columns={[{ key: 'name', label: '主机记录', render: (item) => item.subdomain }, { key: 'type', label: '类型', render: (item) => item.type }, { key: 'count', label: '记录数', render: (item) => item.recordCount }, { key: 'lines', label: '线路', render: (item) => item.lineAlgorithms.map((line) => line.lineId).join('、') || '—' }, { key: 'status', label: '状态', render: (item) => item.type === 'CNAME' && item.enabled ? <StatusBadge value={item.enabled} /> : <button onClick={() => weightStatus.mutate(item)}><StatusBadge value={item.enabled} /></button> }, { key: 'action', label: '', render: (item) => <WeightedEditor domainId={domainId} item={item} options={options} /> }]} emptyTitle="暂无权重解析集合" /></CardContent></Card> : null}
  </div>
}

function WeightedEditor({ domainId, item, options }: { domainId: number; item: WeightedRecordSet; options: RecordOptions }) {
  const [open, setOpen] = useState(false)
  const [lineId, setLineId] = useState(item.lineAlgorithms[0]?.lineId ?? options.lines[0]?.id ?? '')
  const [enabled, setEnabled] = useState(item.enabled)
  const [weightsText, setWeightsText] = useState('')
  const lookup = useQuery({
    queryKey: ['record-lookup', domainId, item.lookupName],
    queryFn: async () => (await apiGet<DataResponse<DnsRecord[]>>(`/api/web/v1/domains/${domainId}/record-lookup`, { name: item.lookupName })).data,
    enabled: open,
  })
  const availableLines = useMemo(() => {
    if (!lookup.data) return options.lines
    const lineIds = new Set(lookup.data.map((record) => record.line.id))
    return options.lines.filter((line) => lineIds.has(line.id))
  }, [lookup.data, options.lines])
  const enabledForLine = (nextLineId: string) => item.type === 'CNAME'
    || item.lineAlgorithms.find((line) => line.lineId === nextLineId)?.enabled
    || (item.lineAlgorithms.length === 0 && item.enabled)
  const weightsForLine = (nextLineId: string) => (lookup.data ?? [])
    .filter((record) => record.line.id === nextLineId)
    .map((record) => `${record.id}=${record.weight ?? 0}`)
    .join('\n')
  const save = useApiMutation<void, DataResponse<OperationResult>>({
    mutationFn: () => {
      const weights = Object.fromEntries(weightsText.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
        const separator = line.lastIndexOf('=')
        return separator > 0 ? [line.slice(0, separator).trim(), Number(line.slice(separator + 1).trim())] : ['', 0]
      }).filter(([id]) => id))
      return apiPut(`/api/web/v1/domains/${domainId}/weighted-records`, { subdomain: item.subdomain, type: item.type, lineId, enabled, weights })
    },
    successMessage: (result) => result.message ?? '权重解析已更新', invalidate: [['weighted-records', domainId], ['records', domainId]],
  })
  useEffect(() => {
    if (!lookup.data) return
    const nextLineId = availableLines.some((line) => line.id === lineId) ? lineId : availableLines[0]?.id ?? ''
    setLineId(nextLineId)
    setEnabled(item.type === 'CNAME'
      || item.lineAlgorithms.find((line) => line.lineId === nextLineId)?.enabled
      || (item.lineAlgorithms.length === 0 && item.enabled))
    setWeightsText(lookup.data
      .filter((record) => record.line.id === nextLineId)
      .map((record) => `${record.id}=${record.weight ?? 0}`)
      .join('\n'))
  }, [availableLines, item.enabled, item.lineAlgorithms, item.type, lineId, lookup.data])
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button size="sm" variant="outline" />}>配置</DialogTrigger><DialogContent className="sm:max-w-lg"><form onSubmit={(event) => { event.preventDefault(); save.mutate(undefined, { onSuccess: () => setOpen(false) }) }}><DialogHeader><DialogTitle>配置权重解析</DialogTitle><DialogDescription>{item.subdomain} · {item.type}，仅提交当前线路下的记录权重。</DialogDescription></DialogHeader><div className="py-5"><FieldGroup><Field><FieldLabel>线路</FieldLabel><Select items={availableLines.map((line) => ({ value: line.id, label: line.label }))} value={lineId || null} onValueChange={(value) => { const nextLineId = value ?? ''; setLineId(nextLineId); setEnabled(enabledForLine(nextLineId)); setWeightsText(weightsForLine(nextLineId)) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{availableLines.map((line) => <SelectItem key={line.id} value={line.id}>{line.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field orientation="horizontal"><FieldLabel htmlFor={`weight-${item.id}`}>启用权重解析</FieldLabel><Switch id={`weight-${item.id}`} checked={enabled} disabled={item.type === 'CNAME'} onCheckedChange={setEnabled} /></Field><Field><FieldLabel htmlFor={`weights-${item.id}`}>记录权重</FieldLabel><Textarea id={`weights-${item.id}`} rows={Math.max(4, lookup.data?.filter((record) => record.line.id === lineId).length ?? 4)} value={weightsText} disabled={!enabled} onChange={(event) => setWeightsText(event.target.value)} /></Field></FieldGroup>{lookup.isError ? <QueryError error={lookup.error} retry={() => void lookup.refetch()} /> : null}</div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button><Button type="submit" disabled={save.isPending || !lineId || (enabled && !weightsText.trim())}>{save.isPending ? <Spinner data-icon="inline-start" /> : null}保存</Button></DialogFooter></form></DialogContent></Dialog>
}

export function RecordsPage() {
  const { domainId: rawDomainId } = useParams()
  const domainId = Number(rawDomainId)
  if (!Number.isInteger(domainId) || domainId <= 0) return <Navigate to="/domains" replace />
  return <RecordsContent domainId={domainId} />
}
