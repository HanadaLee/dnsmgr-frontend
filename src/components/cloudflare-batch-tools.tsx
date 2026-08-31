import { useState } from 'react'
import { FileCheck2Icon, LinkIcon, RefreshCwIcon, ShieldCheckIcon } from 'lucide-react'

import { apiGet, apiPost } from '@/api/client'
import type { CloudflareCustomHostname, CloudflareDnsLine, CloudflareTxtTargetCandidate, DataResponse, OperationResult } from '@/api/types'
import { ConfirmAction } from '@/components/confirm-action'
import { DataTable, type DataColumn } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { recordValueForSave } from '@/lib/dns-record-value'

type BatchMode = 'ownership' | 'certificate' | 'dcv'
type BatchRecord = {
  key: string
  hostname: string
  type: 'TXT' | 'CNAME'
  name: string
  value: string
  candidates: CloudflareTxtTargetCandidate[]
  targetId: string
  status: 'ready' | 'running' | 'success' | 'failed'
  message?: string
}

const modeText: Record<BatchMode, { title: string; description: string; remark: string }> = {
  ownership: { title: '批量写入主机名验证', description: '为所选主机名写入所有权 TXT 验证记录。', remark: 'Cloudflare 主机名验证' },
  certificate: { title: '批量写入证书验证', description: '为所选主机名写入证书 TXT 或 CNAME 验证记录。', remark: 'Cloudflare 证书验证' },
  dcv: { title: '批量添加 DCV 委派', description: '为所选主机名创建 ACME DCV 委派 CNAME 记录。', remark: 'Cloudflare DCV 委派' },
}

function sourceRecords(items: CloudflareCustomHostname[], mode: BatchMode, uuid?: string) {
  const result: Array<{ hostname: string; type: 'TXT' | 'CNAME'; name: string; value: string }> = []
  for (const item of items) {
    if (mode === 'ownership') {
      const verification = item.ownershipVerification
      if (verification.name && verification.value) result.push({ hostname: item.hostname, type: 'TXT', name: verification.name, value: verification.value })
    } else if (mode === 'certificate') {
      item.ssl.validationRecords.forEach((record) => {
        if (record.txtName && record.txtValue) result.push({ hostname: item.hostname, type: 'TXT', name: record.txtName, value: record.txtValue })
        if (record.cnameName && record.cnameTarget) result.push({ hostname: item.hostname, type: 'CNAME', name: record.cnameName, value: record.cnameTarget })
      })
    } else if (uuid) {
      result.push({ hostname: item.hostname, type: 'CNAME', name: `_acme-challenge.${item.hostname}`, value: `${item.hostname}.${uuid}.dcv.cloudflare.com` })
    }
  }
  const seen = new Set<string>()
  return result.filter((record) => {
    const key = `${record.type}\0${record.name}\0${record.value}`
    if (seen.has(key)) return false
    seen.add(key); return true
  })
}

export function CloudflareBatchTools({ domainId, items, dcvUuid, onFinished }: { domainId: number; items: CloudflareCustomHostname[]; dcvUuid?: string; onFinished: () => void }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<BatchMode>('ownership')
  const [rows, setRows] = useState<BatchRecord[]>([])
  const [preparing, setPreparing] = useState(false)
  const [running, setRunning] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [progress, setProgress] = useState(0)

  async function prepare(nextMode: BatchMode) {
    const source = sourceRecords(items, nextMode, dcvUuid)
    if (!source.length) {
      toast.add({ title: nextMode === 'dcv' && !dcvUuid ? '未获取到 DCV 委派标识' : '所选主机名没有可写入的验证记录', type: 'warning' })
      return
    }
    setMode(nextMode); setPreparing(true); setRows([]); setProgress(0); setOpen(true)
    const resolved = await Promise.all(source.map(async (record, index): Promise<BatchRecord> => {
      try {
        const response = await apiGet<DataResponse<{ hostname: string; candidates: CloudflareTxtTargetCandidate[] }>>(`/api/web/v1/cloudflare/domains/${domainId}/txt-targets`, { hostname: record.name })
        const candidates = response.data.candidates
        const preferred = candidates.find((candidate) => candidate.currentDomain) ?? candidates[0]
        return { ...record, key: `${index}:${record.type}:${record.name}`, candidates, targetId: preferred ? String(preferred.domainId) : '', status: 'ready', message: candidates.length ? undefined : '未找到托管 DNS 域名' }
      } catch (error) {
        return { ...record, key: `${index}:${record.type}:${record.name}`, candidates: [], targetId: '', status: 'failed', message: error instanceof Error ? error.message : '解析目标失败' }
      }
    }))
    setRows(resolved); setPreparing(false)
  }

  async function execute() {
    setRunning(true); setProgress(0)
    const next = rows.map((row) => ({ ...row }))
    let success = 0
    for (let index = 0; index < next.length; index += 1) {
      const row = next[index]
      const target = row.candidates.find((candidate) => String(candidate.domainId) === row.targetId)
      if (!target) { row.status = 'failed'; row.message = '请选择写入目标'; setRows([...next]); continue }
      row.status = 'running'; row.message = undefined; setRows([...next])
      try {
        const line = await apiGet<DataResponse<{ defaultLine: string; lines: CloudflareDnsLine[] }>>(`/api/web/v1/cloudflare/domains/${target.domainId}/default-line`)
        await apiPost<DataResponse<OperationResult>>(`/api/web/v1/domains/${target.domainId}/records`, { name: target.recordName, type: row.type, value: recordValueForSave(target.accountType, row.type, row.value), lineId: line.data.defaultLine, ttl: 600, mxPriority: 1, weight: 0, remark: modeText[mode].remark })
        row.status = 'success'; row.message = '写入成功'; success += 1
      } catch (error) { row.status = 'failed'; row.message = error instanceof Error ? error.message : '写入失败' }
      setProgress(Math.round(((index + 1) / next.length) * 100)); setRows([...next])
    }
    setRunning(false); onFinished()
    toast.add({ title: `${modeText[mode].title}完成`, description: `成功 ${success} 条，失败 ${next.length - success} 条`, type: success === next.length ? 'success' : 'warning' })
  }

  async function refreshAll() {
    setRefreshing(true)
    let success = 0
    for (const item of items) {
      try { await apiPost<DataResponse<OperationResult>>(`/api/web/v1/cloudflare/domains/${domainId}/custom-hostnames/${item.id}/refresh`, {}); success += 1 } catch { /* report aggregate result */ }
    }
    setRefreshing(false); onFinished()
    toast.add({ title: '批量刷新验证完成', description: `成功 ${success} 个，失败 ${items.length - success} 个`, type: success === items.length ? 'success' : 'warning' })
  }

  const columns: DataColumn<BatchRecord>[] = [
    { key: 'hostname', label: '自定义主机名', render: (row) => <span className="font-medium">{row.hostname}</span> },
    { key: 'record', label: '验证记录', render: (row) => <div className="max-w-sm"><p className="text-xs text-muted-foreground">{row.type}</p><code className="block truncate" title={row.name}>{row.name}</code><code className="block truncate text-xs text-muted-foreground" title={row.value}>{row.value}</code></div> },
    { key: 'target', label: '写入到', render: (row) => row.candidates.length ? <Select items={row.candidates.map((candidate) => ({ value: String(candidate.domainId), label: `${candidate.domainName} · ${candidate.accountDisplayName}` }))} value={row.targetId || null} disabled={running} onValueChange={(value) => setRows((current) => current.map((item) => item.key === row.key ? { ...item, targetId: value ?? '' } : item))}><SelectTrigger className="w-60"><SelectValue placeholder="请选择目标域名" /></SelectTrigger><SelectContent><SelectGroup>{row.candidates.map((candidate) => <SelectItem key={`${row.key}-${candidate.domainId}`} value={String(candidate.domainId)}>{candidate.domainName} · {candidate.accountDisplayName}</SelectItem>)}</SelectGroup></SelectContent></Select> : <span className="text-sm text-destructive">{row.message}</span> },
    { key: 'status', label: '状态', render: (row) => row.status === 'running' ? <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Spinner />写入中</span> : <span className={row.status === 'failed' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{row.message ?? '待写入'}</span> },
  ]

  return <>
    <Button size="sm" variant="outline" onClick={() => void prepare('ownership')}><FileCheck2Icon data-icon="inline-start" />主机名 TXT</Button>
    <Button size="sm" variant="outline" onClick={() => void prepare('certificate')}><ShieldCheckIcon data-icon="inline-start" />证书验证</Button>
    <Button size="sm" variant="outline" disabled={!dcvUuid} onClick={() => void prepare('dcv')}><LinkIcon data-icon="inline-start" />DCV 委派</Button>
    <ConfirmAction trigger={<Button size="sm" variant="outline"><RefreshCwIcon data-icon="inline-start" />刷新验证</Button>} title="重新发起所选主机名验证？" description={`将依次刷新 ${items.length} 个自定义主机名。`} pending={refreshing} onConfirm={() => void refreshAll()} />
    <Dialog open={open} onOpenChange={(next) => { if (!running) setOpen(next) }}><DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-6xl"><DialogHeader><DialogTitle>{modeText[mode].title}</DialogTitle><DialogDescription>{modeText[mode].description} 每条记录都可以选择具体的托管域名与账户。</DialogDescription></DialogHeader>{preparing ? <div className="flex items-center justify-center gap-2 rounded-lg border py-12 text-sm text-muted-foreground"><Spinner />正在匹配托管 DNS 域名…</div> : <DataTable rows={rows} columns={columns} rowKey={(row) => row.key} emptyTitle="没有可处理的验证记录" />}{running ? <Progress value={progress} /> : null}<DialogFooter><Button variant="outline" disabled={running} onClick={() => setOpen(false)}>关闭</Button><Button disabled={preparing || running || !rows.some((row) => row.targetId)} onClick={() => void execute()}>{running ? <Spinner data-icon="inline-start" /> : null}写入 {rows.filter((row) => row.targetId).length} 条记录</Button></DialogFooter></DialogContent></Dialog>
  </>
}
