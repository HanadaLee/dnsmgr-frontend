import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'

import { apiGetAll } from '@/api/client'
import type { DomainSummary } from '@/api/types'
import { useSession } from '@/auth/session-context'
import { AddRecords } from '@/components/batch-operations/add-records'
import { BatchPagedTable } from '@/components/batch-operations/common'
import { DomainScope } from '@/components/batch-operations/domain-scope'
import { AddDomains, SelectedDomainTask } from '@/components/batch-operations/domains'
import { BatchRecords } from '@/components/batch-operations/records'
import type { BatchComplete } from '@/components/batch-operations/submit'
import { LoadingTable } from '@/components/loading-table'
import { PageHeader } from '@/components/page-header'
import { QueryError } from '@/components/query-error'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/components/ui/toast'
import {
  BATCH_LIMIT,
  BATCH_TASKS,
  batchTaskFromQuery,
  selectedDomains,
  type DomainSelection,
} from '@/lib/batch-operations'
import { BATCH_STATE_LABELS, type BatchResult } from '@/lib/batch-execution'

type BatchHistory = { id: number; time: string; label: string; results: BatchResult[] }

function BatchWorkspace({ domains }: { domains: DomainSummary[] }) {
  const session = useSession()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<BatchHistory[]>([])
  const [viewHistory, setViewHistory] = useState<number | null>(null)
  const [selection, setSelection] = useState<DomainSelection>(() => {
    const ids = (params.get('domains') ?? '')
      .split(',')
      .filter((id) => /^\d+$/.test(id))
      .map(Number)
    return {
      mode: 'specified',
      text: [...new Set(domains.filter((domain) => ids.includes(domain.id)).map((domain) => domain.name))].join('\n'),
      explicitIds: ids.length ? ids : undefined,
      group: '',
    }
  })
  const requestedTask = batchTaskFromQuery(params.get('task') ?? params.get('tab'))
  const tasks = BATCH_TASKS.filter(
    (task) => session.capabilities.domainAccounts || (task.value !== 'add-domain' && task.value !== 'delete-domain'),
  )
  const task = tasks.some((item) => item.value === requestedTask) ? requestedTask : 'query-record'
  const scope = selectedDomains(selection, domains)
  const invalid = !!scope.errors.length || !scope.domains.length || scope.domains.length > BATCH_LIMIT
  const scopeKey = JSON.stringify(selection)
  const onComplete: BatchComplete = (label, results) => {
    setHistory((current) =>
      [{ id: Date.now(), time: new Date().toLocaleString(), label, results }, ...current].slice(0, 20),
    )
    void queryClient.invalidateQueries({ queryKey: ['domains'] })
  }

  useEffect(() => {
    if (!busy) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const preventNavigation = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a[href]')) {
        event.preventDefault()
        event.stopPropagation()
        toast.add({ title: '任务执行中，请先等待完成或停止后续执行', type: 'warning' })
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', preventNavigation, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', preventNavigation, true)
    }
  }, [busy])

  const changeTask = (value: unknown) => {
    if (busy || typeof value !== 'string') return
    const next = new URLSearchParams(params)
    next.delete('tab')
    next.set('task', value)
    setParams(next, { replace: true })
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[10rem_minmax(0,1fr)]">
      <nav
        aria-label="批量操作类型"
        className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-2 lg:sticky lg:top-20 lg:flex-col"
      >
        {tasks.map((item) => (
          <Button
            key={item.value}
            type="button"
            variant={task === item.value ? 'secondary' : 'ghost'}
            className="shrink-0 justify-start"
            aria-current={task === item.value ? 'page' : undefined}
            disabled={busy}
            onClick={() => changeTask(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col gap-5">
        {task !== 'add-domain' && task !== 'log' ? (
          <DomainScope domains={domains} value={selection} onChange={setSelection} disabled={busy} />
        ) : null}
        {scope.domains.length > BATCH_LIMIT && task !== 'add-domain' && task !== 'log' ? (
          <Alert variant="destructive">
            <AlertDescription>单次最多选择 {BATCH_LIMIT} 个域名 / DNS 账户组合，请缩小范围。</AlertDescription>
          </Alert>
        ) : null}
        {task === 'add-domain' ? <AddDomains busy={busy} onBusyChange={setBusy} onComplete={onComplete} /> : null}
        {task === 'add-record' || task === 'import-record' ? (
          <AddRecords
            key={task}
            domains={scope.domains}
            importMode={task === 'import-record'}
            disabled={invalid}
            busy={busy}
            onBusyChange={setBusy}
            onComplete={onComplete}
          />
        ) : null}
        {['query-record', 'modify-record', 'delete-record', 'export-record'].includes(task) ? (
          <BatchRecords
            key={`${task}:${scopeKey}`}
            task={task as 'query-record' | 'modify-record' | 'delete-record' | 'export-record'}
            domains={scope.domains}
            disabled={invalid}
            busy={busy}
            onBusyChange={setBusy}
            onComplete={onComplete}
          />
        ) : null}
        {task === 'delete-domain' || task === 'export-domain' ? (
          <SelectedDomainTask
            key={`${task}:${scopeKey}`}
            domains={scope.domains}
            task={task}
            disabled={invalid}
            busy={busy}
            onBusyChange={setBusy}
            onComplete={onComplete}
          />
        ) : null}
        {task === 'log' ? (
          <Card>
            <CardHeader>
              <CardTitle>批量操作日志</CardTitle>
              <CardDescription>
                显示本次打开页面期间的最近 20
                批执行记录。刷新或离开页面后不保留；服务器操作日志可从下方入口查看。这不是后台异步任务，执行时请保持页面打开。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {session.capabilities.logs ? (
                <Button className="self-start" variant="outline" nativeButton={false} render={<Link to="/logs" />}>
                  查看服务器操作日志
                </Button>
              ) : null}
              <BatchPagedTable
                rows={history}
                rowKey={(entry) => String(entry.id)}
                emptyTitle="本次页面尚无执行记录"
                columns={[
                  { key: 'time', label: '执行时间', render: (entry) => entry.time },
                  { key: 'task', label: '操作', render: (entry) => entry.label },
                  {
                    key: 'count',
                    label: '结果',
                    render: (entry) =>
                      `共 ${entry.results.length} 项 · 成功 ${entry.results.filter((item) => item.state === 'success').length} · 失败 ${entry.results.filter((item) => item.state === 'failed').length} · 待核对 ${entry.results.filter((item) => item.state === 'unknown').length} · 未执行 ${entry.results.filter((item) => item.state === 'skipped').length}`,
                  },
                  {
                    key: 'view',
                    label: '详情',
                    render: (entry) => (
                      <Button type="button" variant="ghost" onClick={() => setViewHistory(entry.id)}>
                        查看逐项结果
                      </Button>
                    ),
                  },
                ]}
              />
              {viewHistory !== null ? (
                <BatchPagedTable
                  key={viewHistory}
                  rows={history.find((entry) => entry.id === viewHistory)?.results ?? []}
                  rowKey={(result) => result.plan.key}
                  columns={[
                    {
                      key: 'domain',
                      label: '域名 / DNS 账户',
                      render: (result) => `${result.plan.domainName} · ${result.plan.provider}`,
                    },
                    { key: 'name', label: '主机记录', render: (result) => result.plan.name },
                    { key: 'state', label: '结果', render: (result) => BATCH_STATE_LABELS[result.state] },
                    {
                      key: 'detail',
                      label: '详情',
                      className: 'whitespace-normal break-all',
                      render: (result) => result.message ?? result.plan.after,
                    },
                  ]}
                />
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

export function RecordToolsPage() {
  const domains = useQuery({
    queryKey: ['domains', 'all-record-tools'],
    queryFn: () => apiGetAll<DomainSummary>('/api/web/v1/domains'),
  })
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="DNS Tools"
        title="批量操作"
        description="按任务选择域名、筛选记录、逐条填写变更，确认预览后再执行。支持跨 DNS 服务商和账户。"
      />
      {domains.data ? (
        <>
          {domains.isError ? <QueryError error={domains.error} retry={() => void domains.refetch()} /> : null}
          <BatchWorkspace domains={domains.data} />
        </>
      ) : domains.isError ? (
        <QueryError error={domains.error} retry={() => void domains.refetch()} />
      ) : (
        <LoadingTable />
      )}
    </div>
  )
}
