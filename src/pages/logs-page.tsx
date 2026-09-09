import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SearchIcon } from 'lucide-react'

import { apiGet } from '@/api/client'
import type { AuditLogEntry, PageResponse } from '@/api/types'
import { useSession } from '@/auth/session-context'
import { DataTable, type DataColumn } from '@/components/data-table'
import { ListPagination } from '@/components/list-pagination'
import { LoadingTable } from '@/components/loading-table'
import { PageHeader } from '@/components/page-header'
import { QueryError } from '@/components/query-error'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/lib/format'

export function LogsPage() {
  const session = useSession()
  const canFilterByUser = session.capabilities.users
  const [page, setPage] = useState(1)
  const [form, setForm] = useState({ q: '', domain: '', userId: '' })
  const [filters, setFilters] = useState(form)
  const query = useQuery({ queryKey: ['logs', page, filters, canFilterByUser], queryFn: () => apiGet<PageResponse<AuditLogEntry>>('/api/web/v1/logs', { page, pageSize: 20, q: filters.q, domain: filters.domain, userId: canFilterByUser && filters.userId ? Number(filters.userId) : undefined }) })
  const columns: DataColumn<AuditLogEntry>[] = [
    { key: 'time', label: '时间', render: (item) => <span className="whitespace-nowrap">{formatDateTime(item.occurredAt)}</span> },
    { key: 'actor', label: '操作者', render: (item) => <Badge variant="secondary">{item.actor.kind === 'administrator' ? '管理员' : `用户 #${item.actor.userId}`}</Badge> },
    { key: 'domain', label: '域名', render: (item) => item.domain ?? '—' },
    { key: 'action', label: '操作', render: (item) => <span className="font-medium">{item.action}</span> },
    { key: 'detail', label: '详情', render: (item) => <span className="block max-w-xl break-words text-muted-foreground">{item.detail || '—'}</span> },
  ]
  return <div className="flex flex-col gap-6"><PageHeader eyebrow="Administration" title="操作日志" description="审计管理员与用户执行的域名、记录和系统操作。" /><Card><CardContent className="flex flex-col gap-4"><form className={canFilterByUser ? 'grid gap-2 md:grid-cols-[1fr_1fr_10rem_auto]' : 'grid gap-2 md:grid-cols-[1fr_1fr_auto]'} onSubmit={(event) => { event.preventDefault(); setPage(1); setFilters({ ...form, userId: canFilterByUser ? form.userId : '' }) }}><div className="relative"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={form.q} onChange={(event) => setForm({ ...form, q: event.target.value })} placeholder="搜索操作或详情" /></div><Input value={form.domain} onChange={(event) => setForm({ ...form, domain: event.target.value })} placeholder="筛选域名" />{canFilterByUser ? <Input type="number" min={1} value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })} placeholder="用户 ID" /> : null}<Button type="submit" variant="outline">筛选</Button></form>{query.isError ? <QueryError error={query.error} retry={() => void query.refetch()} /> : query.isPending ? <LoadingTable /> : <DataTable rows={query.data.data} columns={columns} rowKey={(item) => String(item.id)} emptyTitle="暂无操作日志" />}{query.data ? <ListPagination meta={query.data.meta} onPageChange={setPage} /> : null}</CardContent></Card></div>
}
