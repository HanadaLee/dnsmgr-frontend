import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react'

import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client'
import type { DataResponse, DnsRecord, OperationResult, PageResponse, RecordCheckResult, RecordOptions } from '@/api/types'
import { ConfirmAction } from '@/components/confirm-action'
import { DataTable, type DataColumn } from '@/components/data-table'
import { FormDialog, type FormFieldSpec } from '@/components/form-dialog'
import { ListPagination } from '@/components/list-pagination'
import { LoadingTable } from '@/components/loading-table'
import { QueryError } from '@/components/query-error'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { useApiMutation } from '@/hooks/use-api-mutation'

const modeLabels: Record<number, string> = { 1: '普通', 2: '轮询', 3: '权重', 4: '智能' }

function snapshot(record: DnsRecord) {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    value: record.value,
    values: record.values,
    lineId: record.line.id,
    ttl: record.ttl ?? 600,
    mxPriority: record.mxPriority ?? 1,
    weight: record.weight ?? 0,
    mode: record.mode,
    parentId: record.parentId,
    remark: record.remark ?? null,
  }
}

function fields(options: RecordOptions): FormFieldSpec[] {
  return [
    { name: 'name', label: '主机记录', placeholder: '@ 或 www', required: true },
    { name: 'type', label: '记录类型', kind: 'select', options: options.recordTypes.map((value) => ({ value, label: value })), required: true },
    { name: 'lineId', label: '解析线路', kind: 'select', options: options.lines.map((line) => ({ value: line.id, label: line.parent ? `${line.parent} / ${line.label}` : line.label })), required: true },
    { name: 'mode', label: '解析模式', kind: 'select', options: (values) => values.type === 'CNAME' ? [{ value: '1', label: '普通' }, { value: '3', label: '权重' }] : [{ value: '1', label: '普通' }, { value: '2', label: '轮询' }, { value: '4', label: '智能' }, { value: '3', label: '权重' }], visible: (values) => values.type === 'A' || values.type === 'CNAME' },
    { name: 'value', label: '记录值', kind: 'textarea', description: '添加 A 记录时可用逗号分隔多个 IP。', required: true },
    { name: 'mxPriority', label: 'MX 优先级', kind: 'number', min: 0, max: 65535, visible: (values) => values.type === 'MX' },
    { name: 'ttl', label: 'TTL', kind: 'number', min: options.minTtl, required: true },
    { name: 'weight', label: '权重', kind: 'number', min: 1, max: 99, visible: (values) => (values.type === 'A' || values.type === 'CNAME') && Number(values.mode) === 3 },
  ]
}

function payload(values: Record<string, unknown>) {
  const type = String(values.type ?? '')
  return {
    ...values,
    ttl: Number(values.ttl),
    mxPriority: Number(values.mxPriority ?? 10),
    weight: Number(values.weight ?? 0),
    mode: type === 'A' || type === 'CNAME' ? Number(values.mode ?? 1) : undefined,
    parentId: String(values.parentId ?? '') || undefined,
    remark: null,
  }
}

async function allChildren(domainId: number, parentId: string) {
  const first = await apiGet<PageResponse<DnsRecord>>(`/api/web/v1/domains/${domainId}/records`, { page: 1, pageSize: 100, subdomain: parentId })
  const rows = [...first.data]
  const pageCount = Math.ceil(first.meta.total / first.meta.pageSize)
  for (let page = 2; page <= pageCount; page += 1) {
    const next = await apiGet<PageResponse<DnsRecord>>(`/api/web/v1/domains/${domainId}/records`, { page, pageSize: 100, subdomain: parentId })
    rows.push(...next.data)
  }
  return rows
}

export function QingCloudRecords({ domainId, options }: { domainId: number; options: RecordOptions }) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [queryText, setQueryText] = useState('')
  const parents = useQuery({
    queryKey: ['records', domainId, 'parents', page, queryText],
    queryFn: () => apiGet<PageResponse<DnsRecord>>(`/api/web/v1/domains/${domainId}/records`, { page, pageSize: 10, q: queryText }),
  })
  const invalidate = [['records', domainId], ['domain', domainId], ['domains']] as const
  const create = useApiMutation<Record<string, unknown>, DataResponse<OperationResult>>({ mutationFn: (body) => apiPost(`/api/web/v1/domains/${domainId}/records`, body), successMessage: '解析记录已添加', invalidate: [...invalidate] })
  const update = useApiMutation<{ record: DnsRecord; body: Record<string, unknown> }, DataResponse<OperationResult>>({ mutationFn: ({ record, body }) => apiPatch(`/api/web/v1/domains/${domainId}/records/${encodeURIComponent(record.id)}`, { ...body, current: snapshot(record) }), successMessage: '解析记录已更新', invalidate: [...invalidate] })
  const remove = useApiMutation<DnsRecord, DataResponse<OperationResult>>({ mutationFn: (record) => apiDelete(`/api/web/v1/domains/${domainId}/records/${encodeURIComponent(record.id)}`, record.type === 'UNKNOWN' ? undefined : { current: snapshot(record) }), successMessage: '解析记录已删除', invalidate: [...invalidate] })
  const status = useApiMutation<DnsRecord, DataResponse<OperationResult>>({ mutationFn: (record) => apiPatch(`/api/web/v1/domains/${domainId}/records/${encodeURIComponent(record.id)}/status`, { enabled: record.status !== 'enabled', current: snapshot(record) }), successMessage: '记录状态已更新', invalidate: [...invalidate] })
  const remark = useApiMutation<{ id: string; remark: string | null }, DataResponse<OperationResult>>({ mutationFn: ({ id, remark: value }) => apiPatch(`/api/web/v1/domains/${domainId}/records/${encodeURIComponent(id)}/remark`, { remark: value }), successMessage: '主机记录备注已更新', invalidate: [...invalidate] })
  const check = useApiMutation<DnsRecord, DataResponse<RecordCheckResult>>({ mutationFn: (record) => apiPost(`/api/web/v1/domains/${domainId}/records/${encodeURIComponent(record.id)}/check`, { name: record.name, type: record.type, value: record.values?.[0] ?? record.value }), successMessage: ({ data }) => `${data.message ?? ({ active: '解析结果匹配', mismatch: '解析结果不匹配', not_found: '未查询到解析记录' }[data.status])}${data.actual.length ? ` · 实际值：${data.actual.join('、')}` : ''}` })

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); setPage(1); setQueryText(search.trim()) }}>
          <div className="relative min-w-0 flex-1"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索主机记录" /></div>
          <Button type="submit" variant="outline">搜索</Button>
          <Button type="button" variant="ghost" onClick={() => { setSearch(''); setQueryText(''); setPage(1); void parents.refetch() }}><RefreshCwIcon data-icon="inline-start" />刷新</Button>
        </form>
        {parents.isError ? <QueryError error={parents.error} retry={() => void parents.refetch()} /> : parents.isPending ? <LoadingTable /> : parents.data.data.length ? (
          <div className="flex flex-col gap-2">
            {parents.data.data.map((parent) => (
              <QingCloudParent
                key={parent.id}
                domainId={domainId}
                parent={parent}
                options={options}
                createPending={create.isPending}
                updatePending={update.isPending}
                deletePending={remove.isPending}
                statusPending={status.isPending}
                remarkPending={remark.isPending}
                onCreate={(body, close) => create.mutate(body, { onSuccess: close })}
                onUpdate={(record, body, close) => update.mutate({ record, body }, { onSuccess: close })}
                onDelete={(record) => remove.mutate(record)}
                onStatus={(record) => status.mutate(record)}
                onRemark={(value, close) => remark.mutate({ id: parent.id, remark: value }, { onSuccess: close })}
                onCheck={(record) => check.mutate(record)}
              />
            ))}
          </div>
        ) : <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">暂无解析记录</div>}
        {parents.data ? <ListPagination meta={parents.data.meta} onPageChange={setPage} /> : null}
      </CardContent>
    </Card>
  )
}

function QingCloudParent({ domainId, parent, options, createPending, updatePending, deletePending, statusPending, remarkPending, onCreate, onUpdate, onDelete, onStatus, onRemark, onCheck }: {
  domainId: number
  parent: DnsRecord
  options: RecordOptions
  createPending: boolean
  updatePending: boolean
  deletePending: boolean
  statusPending: boolean
  remarkPending: boolean
  onCreate: (body: Record<string, unknown>, close: () => void) => void
  onUpdate: (record: DnsRecord, body: Record<string, unknown>, close: () => void) => void
  onDelete: (record: DnsRecord) => void
  onStatus: (record: DnsRecord) => void
  onRemark: (remark: string | null, close: () => void) => void
  onCheck: (record: DnsRecord) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const children = useQuery({
    queryKey: ['records', domainId, 'children', parent.id],
    queryFn: () => allChildren(domainId, parent.id),
    enabled: expanded,
  })
  const childFields = fields(options)
  const initial = { parentId: parent.id, name: parent.name, type: 'A', lineId: options.lines[0]?.id ?? '', mode: 1, value: '', ttl: Math.max(600, options.minTtl), mxPriority: 10, weight: 1 }
  const columns: DataColumn<DnsRecord>[] = [
    { key: 'line', label: '线路', render: (record) => record.line.label },
    { key: 'type', label: '类型', render: (record) => <Badge variant="outline">{record.type}</Badge> },
    { key: 'mode', label: '模式', render: (record) => record.type === 'A' || record.type === 'CNAME' ? <div className="flex items-center gap-1.5"><span>{modeLabels[record.mode ?? 1] ?? '普通'}</span>{record.mode === 3 ? <Badge variant="secondary">{record.weight ?? 0}</Badge> : null}</div> : '—' },
    { key: 'value', label: '记录值', render: (record) => <div className="flex max-w-md items-center gap-1"><code className="min-w-0 flex-1 truncate" title={record.value}>{record.value}{record.type === 'MX' ? ` | ${record.mxPriority ?? 10}` : ''}</code><Button size="icon-sm" variant="ghost" aria-label={`复制 ${record.name} 的记录值`} onClick={() => { void navigator.clipboard.writeText(record.value); toast.add({ title: '记录值已复制', type: 'success' }) }}><CopyIcon /></Button></div> },
    { key: 'ttl', label: 'TTL', render: (record) => record.ttl ?? '—' },
    { key: 'status', label: '状态', render: (record) => <Button size="sm" variant="ghost" disabled={statusPending} onClick={() => onStatus(record)}><StatusBadge value={record.status} /></Button> },
    { key: 'actions', label: '', className: 'w-12', render: (record) => <ChildActions record={record} parentId={parent.id} options={options} updatePending={updatePending} deletePending={deletePending} onUpdate={(body, close) => onUpdate(record, body, close)} onDelete={() => onDelete(record)} onCheck={() => onCheck(record)} /> },
  ]

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-2 p-2 sm:flex-row sm:items-center">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={expanded} aria-controls={`qingcloud-children-${parent.id}`} onClick={() => setExpanded((value) => !value)}>
          {expanded ? <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />}
          <span className="min-w-0"><span className="block truncate font-medium">{parent.name}</span>{parent.remark ? <span className="block truncate text-xs text-muted-foreground">{parent.remark}</span> : null}</span>
          <Badge className="ml-auto shrink-0" variant="secondary">{parent.childCount ?? children.data?.length ?? 0} 条</Badge>
        </button>
        <div className="flex shrink-0 items-center gap-1 pl-9 sm:pl-0">
          <FormDialog trigger={<Button size="sm" variant="outline"><PlusIcon data-icon="inline-start" />添加</Button>} title={`添加 ${parent.name} 的解析记录`} fields={childFields} initialValues={initial} pending={createPending} onSubmit={(values, close) => onCreate(payload(values), close)} />
          <FormDialog trigger={<Button size="icon-sm" variant="ghost" aria-label={`编辑 ${parent.name} 的备注`}><PencilIcon /></Button>} title="编辑主机记录备注" fields={[{ name: 'remark', label: '备注', kind: 'textarea' }]} initialValues={{ remark: parent.remark ?? '' }} pending={remarkPending} onSubmit={(values, close) => onRemark(String(values.remark ?? '') || null, close)} />
          <ConfirmAction trigger={<Button size="icon-sm" variant="ghost" aria-label={`删除 ${parent.name}`}><Trash2Icon /></Button>} title="删除主机记录及其全部解析？" description={`${parent.name} 下的 ${parent.childCount ?? 0} 条解析记录将一并删除。`} destructive pending={deletePending} onConfirm={() => onDelete(parent)} />
        </div>
      </div>
      {expanded ? <div id={`qingcloud-children-${parent.id}`} className="border-t bg-muted/15 p-2 sm:p-3">{children.isError ? <QueryError error={children.error} retry={() => void children.refetch()} /> : children.isPending ? <LoadingTable rows={3} /> : <DataTable rows={children.data} columns={columns} rowKey={(record) => record.id} emptyTitle="该主机记录下暂无解析" emptyDescription="可使用上方的添加按钮创建解析记录。" />}</div> : null}
    </div>
  )
}

function ChildActions({ record, parentId, options, updatePending, deletePending, onUpdate, onDelete, onCheck }: {
  record: DnsRecord
  parentId: string
  options: RecordOptions
  updatePending: boolean
  deletePending: boolean
  onUpdate: (body: Record<string, unknown>, close: () => void) => void
  onDelete: () => void
  onCheck: () => void
}) {
  const initial = { parentId, name: record.name, type: record.type, lineId: record.line.id, mode: record.mode ?? 1, value: record.value, ttl: record.ttl ?? 600, mxPriority: record.mxPriority ?? 10, weight: record.weight ?? 1 }
  return <DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`管理 ${record.name} ${record.type}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup>
    <FormDialog trigger={<DropdownMenuItem closeOnClick={false}><PencilIcon />编辑</DropdownMenuItem>} title="编辑解析记录" fields={fields(options)} initialValues={initial} pending={updatePending} onSubmit={(values, close) => onUpdate(payload(values), close)} />
    {['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'].includes(record.type) ? <DropdownMenuItem onClick={onCheck}><CheckCircle2Icon />检查记录</DropdownMenuItem> : null}
    <ConfirmAction trigger={<DropdownMenuItem variant="destructive" closeOnClick={false}><Trash2Icon />删除</DropdownMenuItem>} title="删除解析记录？" description={`${record.name} ${record.type} 将被永久删除。`} destructive pending={deletePending} onConfirm={onDelete} />
  </DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
}
