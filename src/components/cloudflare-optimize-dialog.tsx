import { useState } from 'react'
import { RocketIcon } from 'lucide-react'

import { apiGet, apiGetAll, apiPatch, apiPost } from '@/api/client'
import type { CloudflareCustomHostname, CloudflareDnsLine, CloudflareTxtTargetCandidate, DataResponse, DnsRecord, OperationResult, OptimizeIpTask } from '@/api/types'
import { DataTable, type DataColumn } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'

type OptimizeRow = {
  key: string
  hostname: string
  candidates: CloudflareTxtTargetCandidate[]
  targetId: string
  lines: CloudflareDnsLine[]
  lineId: string
  status: 'ready' | 'running' | 'success' | 'failed'
  message?: string
}

const publicTargets = [
  { value: 'visa.com', label: 'Visa' },
  { value: 'mfa.gov.ua', label: '乌克兰外交部' },
  { value: 'www.shopify.com', label: 'Shopify' },
  { value: 'store.ubi.com', label: 'Ubisoft' },
  { value: 'staticdelivery.nexusmods.com', label: 'NexusMods' },
]

function snapshot(record: DnsRecord) {
  return { id: record.id, name: record.name, type: record.type, value: record.value, values: record.values, lineId: record.line.id, ttl: record.ttl ?? 600, mxPriority: record.mxPriority ?? 1, weight: record.weight ?? 0, remark: record.remark ?? null }
}

async function lineOptions(domainId: number) {
  return (await apiGet<DataResponse<{ defaultLine: string; lines: CloudflareDnsLine[] }>>(`/api/web/v1/cloudflare/domains/${domainId}/default-line`)).data
}

export function CloudflareOptimizeDialog({ domainId, items, onFinished }: { domainId: number; items: CloudflareCustomHostname[]; onFinished: () => void }) {
  const [open, setOpen] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [running, setRunning] = useState(false)
  const [rows, setRows] = useState<OptimizeRow[]>([])
  const [targets, setTargets] = useState(publicTargets)
  const [targetValue, setTargetValue] = useState(publicTargets[0].value)
  const [recordType, setRecordType] = useState<'A' | 'AAAA' | 'CNAME'>('CNAME')
  const [progress, setProgress] = useState(0)

  async function prepare() {
    setOpen(true); setPreparing(true); setRows([]); setProgress(0)
    try {
      const tasks = await apiGetAll<OptimizeIpTask>('/api/web/v1/optimize-ip/tasks')
      const taskTargets = tasks.filter((task) => task.active && task.cdnProvider === 'cloudflare').map((task) => ({ value: task.recordName === '@' ? task.domain : `${task.recordName}.${task.domain}`, label: task.remark || `${task.recordName}.${task.domain}` }))
      const options = [...taskTargets, ...publicTargets].filter((item, index, all) => all.findIndex((candidate) => candidate.value === item.value) === index)
      setTargets(options)
      if (options[0]) setTargetValue(options[0].value)
    } catch { setTargets(publicTargets) }
    const next = await Promise.all(items.map(async (item): Promise<OptimizeRow> => {
      try {
        const response = await apiGet<DataResponse<{ hostname: string; candidates: CloudflareTxtTargetCandidate[] }>>(`/api/web/v1/cloudflare/domains/${domainId}/txt-targets`, { hostname: item.hostname })
        const candidates = response.data.candidates
        const preferred = candidates.find((candidate) => candidate.currentDomain) ?? candidates[0]
        if (!preferred) return { key: item.id, hostname: item.hostname, candidates: [], targetId: '', lines: [], lineId: '', status: 'failed', message: '未找到托管 DNS 域名' }
        const available = await lineOptions(preferred.domainId)
        return { key: item.id, hostname: item.hostname, candidates, targetId: String(preferred.domainId), lines: available.lines, lineId: available.defaultLine, status: 'ready' }
      } catch (error) { return { key: item.id, hostname: item.hostname, candidates: [], targetId: '', lines: [], lineId: '', status: 'failed', message: error instanceof Error ? error.message : '读取 DNS 配置失败' } }
    }))
    setRows(next); setPreparing(false)
  }

  async function changeTarget(row: OptimizeRow, value: string) {
    setRows((current) => current.map((item) => item.key === row.key ? { ...item, targetId: value, lines: [], lineId: '', message: '正在读取线路…' } : item))
    try {
      const available = await lineOptions(Number(value))
      setRows((current) => current.map((item) => item.key === row.key ? { ...item, targetId: value, lines: available.lines, lineId: available.defaultLine, message: undefined, status: 'ready' } : item))
    } catch (error) { setRows((current) => current.map((item) => item.key === row.key ? { ...item, status: 'failed', message: error instanceof Error ? error.message : '读取线路失败' } : item)) }
  }

  async function execute() {
    if (!targetValue.trim()) return
    setRunning(true); setProgress(0)
    const next = rows.map((row) => ({ ...row }))
    let success = 0
    for (let index = 0; index < next.length; index += 1) {
      const row = next[index]
      const target = row.candidates.find((candidate) => String(candidate.domainId) === row.targetId)
      if (!target || !row.lineId) { row.status = 'failed'; row.message = '写入目标或线路未选择'; setRows([...next]); continue }
      row.status = 'running'; row.message = undefined; setRows([...next])
      const body = { name: target.recordName, type: recordType, value: targetValue.trim(), lineId: row.lineId, ttl: 600, mxPriority: 1, weight: 0, remark: 'Cloudflare 优选解析' }
      try {
        const lookup = await apiGet<DataResponse<DnsRecord[]>>(`/api/web/v1/domains/${target.domainId}/record-lookup`, { name: target.recordName })
        const existing = lookup.data.find((record) => ['A', 'AAAA', 'CNAME'].includes(record.type.toUpperCase()) && record.line.id === row.lineId)
        if (existing) {
          try { await apiPatch<DataResponse<OperationResult>>(`/api/web/v1/domains/${target.domainId}/records/${encodeURIComponent(existing.id)}`, { ...body, current: snapshot(existing) }) }
          catch { await apiPost<DataResponse<OperationResult>>(`/api/web/v1/domains/${target.domainId}/records`, body) }
        } else await apiPost<DataResponse<OperationResult>>(`/api/web/v1/domains/${target.domainId}/records`, body)
        row.status = 'success'; row.message = existing ? '已更新现有记录' : '已新增记录'; success += 1
      } catch (error) { row.status = 'failed'; row.message = error instanceof Error ? error.message : '写入失败' }
      setProgress(Math.round(((index + 1) / next.length) * 100)); setRows([...next])
    }
    setRunning(false); onFinished()
    toast.add({ title: 'Cloudflare 优选解析完成', description: `成功 ${success} 个，失败 ${next.length - success} 个`, type: success === next.length ? 'success' : 'warning' })
  }

  const columns: DataColumn<OptimizeRow>[] = [
    { key: 'hostname', label: '自定义主机名', render: (row) => <span className="font-medium">{row.hostname}</span> },
    { key: 'domain', label: '解析域名', render: (row) => row.candidates.length ? <Select items={row.candidates.map((candidate) => ({ value: String(candidate.domainId), label: `${candidate.domainName} · ${candidate.accountDisplayName}` }))} value={row.targetId || null} disabled={running} onValueChange={(value) => value && void changeTarget(row, value)}><SelectTrigger className="w-60"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{row.candidates.map((candidate) => <SelectItem key={`${row.key}-${candidate.domainId}`} value={String(candidate.domainId)}>{candidate.domainName} · {candidate.accountDisplayName}</SelectItem>)}</SelectGroup></SelectContent></Select> : <span className="text-sm text-destructive">{row.message}</span> },
    { key: 'line', label: '解析线路', render: (row) => row.lines.length ? <Select items={row.lines.map((line) => ({ value: line.value, label: line.parent ? `${line.parent} / ${line.label}` : line.label }))} value={row.lineId || null} disabled={running} onValueChange={(value) => setRows((current) => current.map((item) => item.key === row.key ? { ...item, lineId: value ?? '' } : item))}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{row.lines.map((line) => <SelectItem key={`${row.key}-${line.value}`} value={line.value}>{line.parent ? `${line.parent} / ${line.label}` : line.label}</SelectItem>)}</SelectGroup></SelectContent></Select> : <span className="text-sm text-muted-foreground">{row.message ?? '—'}</span> },
    { key: 'status', label: '状态', render: (row) => row.status === 'running' ? <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Spinner />处理中</span> : <span className={row.status === 'failed' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{row.message ?? '待处理'}</span> },
  ]

  return <><Button size="sm" variant="outline" onClick={() => void prepare()}><RocketIcon data-icon="inline-start" />优选解析</Button><Dialog open={open} onOpenChange={(next) => { if (!running) setOpen(next) }}><DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-6xl"><DialogHeader><DialogTitle>Cloudflare 优选解析</DialogTitle><DialogDescription>将所选主机名解析到优选目标；同线路已有 A、AAAA 或 CNAME 时会先确认并更新。</DialogDescription></DialogHeader><FieldGroup className="grid gap-4 sm:grid-cols-[14rem_1fr]"><Field><FieldLabel>记录类型</FieldLabel><Select items={['CNAME', 'A', 'AAAA'].map((value) => ({ value, label: value }))} value={recordType} disabled={running} onValueChange={(value) => setRecordType((value ?? 'CNAME') as 'A' | 'AAAA' | 'CNAME')}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{['CNAME', 'A', 'AAAA'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel>优选目标</FieldLabel><div className="flex gap-2"><Select items={targets.map((target) => ({ value: target.value, label: `${target.value} · ${target.label}` }))} value={targets.some((target) => target.value === targetValue) ? targetValue : null} disabled={running} onValueChange={(value) => value && setTargetValue(value)}><SelectTrigger className="w-60 shrink-0"><SelectValue placeholder="预设目标" /></SelectTrigger><SelectContent><SelectGroup>{targets.map((target) => <SelectItem key={target.value} value={target.value}>{target.value} · {target.label}</SelectItem>)}</SelectGroup></SelectContent></Select><Input value={targetValue} disabled={running} onChange={(event) => setTargetValue(event.target.value)} placeholder="域名或 IP" /></div></Field></FieldGroup>{preparing ? <div className="flex items-center justify-center gap-2 rounded-lg border py-12 text-sm text-muted-foreground"><Spinner />正在读取解析域名和线路…</div> : <DataTable rows={rows} columns={columns} rowKey={(row) => row.key} emptyTitle="没有可处理的主机名" />}{running ? <Progress value={progress} /> : null}<DialogFooter><Button variant="outline" disabled={running} onClick={() => setOpen(false)}>关闭</Button><Button disabled={preparing || running || !targetValue.trim() || !rows.some((row) => row.targetId && row.lineId)} onClick={() => void execute()}>{running ? <Spinner data-icon="inline-start" /> : null}确认执行</Button></DialogFooter></DialogContent></Dialog></>
}
