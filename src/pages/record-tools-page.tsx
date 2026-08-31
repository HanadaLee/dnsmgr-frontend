import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PencilIcon, PlayIcon, PlusIcon, SearchIcon, SquareIcon, WandSparklesIcon } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { apiGet, apiPatch, apiPost } from '@/api/client'
import type { DataResponse, DnsRecord, DomainSummary, OperationResult, PageResponse, RecordOptions } from '@/api/types'
import { DataTable, type DataColumn } from '@/components/data-table'
import { FormDialog } from '@/components/form-dialog'
import { LoadingTable } from '@/components/loading-table'
import { PageHeader } from '@/components/page-header'
import { QueryError } from '@/components/query-error'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import {
  hostForManagedDomain,
  inferRecordType,
  managedDomainCandidates,
  recordMatchesValue,
} from '@/lib/record-tools'

type ParsedRecord = {
  key: string
  row: number
  domainId: number
  domainName: string
  domainCandidates: DomainSummary[]
  name: string
  type: string
  value: string
  lineId: string
  lineLabel: string
  ttl: number
  status: 'pending' | 'running' | 'success' | 'partial' | 'failed'
  message?: string
}

type GlobalRecord = DnsRecord & { key: string; domainId: number; domainName: string; provider: string }
type DomainBatchResult = { id: number; domain: string; provider: string; status: 'pending' | 'running' | 'success' | 'failed'; message?: string }

const globalEditRecordTypes = [
  { value: 'A', label: 'A' },
  { value: 'AAAA', label: 'AAAA' },
  { value: 'CNAME', label: 'CNAME' },
  { value: 'MX', label: 'MX' },
  { value: 'TXT', label: 'TXT' },
  { value: 'NS', label: 'NS' },
  { value: 'SRV', label: 'SRV' },
  { value: 'CAA', label: 'CAA' },
  { value: 'REDIRECT_URL', label: '显性 URL' },
  { value: 'FORWARD_URL', label: '隐性 URL' },
  { value: 'LOC', label: 'LOC' },
  { value: 'PTR', label: 'PTR' },
  { value: 'LUA', label: 'LUA' },
]

async function loadAllDomains(): Promise<DomainSummary[]> {
  const domains: DomainSummary[] = []
  let page = 1
  while (true) {
    const response = await apiGet<PageResponse<DomainSummary>>('/api/web/v1/domains', { page, pageSize: 100, sort: 'name', order: 'asc' })
    domains.push(...response.data)
    if (domains.length >= response.meta.total || response.data.length === 0) return domains
    page += 1
  }
}

function recordSnapshot(record: DnsRecord) {
  return { id: record.id, name: record.name, type: record.type, value: record.value, values: record.values, lineId: record.line.id, ttl: record.ttl ?? 600, mxPriority: record.mxPriority ?? 1, weight: record.weight ?? 0, mode: record.mode, parentId: record.parentId, remark: record.remark ?? null }
}

function operationCounts(message: string | undefined, total: number) {
  const successMatch = /成功[^\d]*(\d+)\s*条/.exec(message ?? '')
  const failedMatch = /失败[^\d]*(\d+)\s*条/.exec(message ?? '')
  const reportedSuccess = successMatch ? Number(successMatch[1]) : undefined
  const reportedFailed = failedMatch ? Number(failedMatch[1]) : undefined
  const success = Math.max(0, Math.min(total, reportedSuccess ?? (reportedFailed === undefined ? total : total - reportedFailed)))
  const failed = Math.max(0, Math.min(total - success, reportedFailed ?? total - success))
  return { success, failed }
}

function SmartParse({ domains }: { domains: DomainSummary[] }) {
  const [text, setText] = useState('')
  const [batchValue, setBatchValue] = useState('')
  const [defaultDomainId, setDefaultDomainId] = useState('')
  const [defaultType, setDefaultType] = useState('auto')
  const [line, setLine] = useState('')
  const [ttl, setTtl] = useState(600)
  const [records, setRecords] = useState<ParsedRecord[]>([])
  const [previewing, setPreviewing] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [parseError, setParseError] = useState('')
  const optionsCache = useRef(new Map<number, Promise<RecordOptions>>())

  function getOptions(domainId: number) {
    let request = optionsCache.current.get(domainId)
    if (!request) {
      request = apiGet<DataResponse<RecordOptions>>(`/api/web/v1/domains/${domainId}/record-options`).then((response) => response.data)
      optionsCache.current.set(domainId, request)
    }
    return request
  }

  async function preview() {
    const inputLines = text.split(/\r?\n/)
    const errors: string[] = []
    const drafts: Array<Omit<ParsedRecord, 'lineId' | 'lineLabel' | 'ttl' | 'status'>> = []
    const defaultDomain = domains.find((domain) => String(domain.id) === defaultDomainId)
    inputLines.forEach((source, index) => {
      const valueText = source.trim()
      if (!valueText) return
      const parts = valueText.split(/\s+/)
      let domain: DomainSummary | undefined
      let domainCandidates: DomainSummary[] = []
      let name = ''
      let value = ''
      if (parts.length === 1 && batchValue.trim()) {
        domainCandidates = managedDomainCandidates(parts[0], domains)
        domain = domainCandidates[0]
        if (domain) { name = hostForManagedDomain(parts[0], domain); value = batchValue.trim() }
      } else if (parts.length === 2) {
        domainCandidates = managedDomainCandidates(parts[1], domains)
        domain = domainCandidates[0]
        if (domain) {
          name = hostForManagedDomain(parts[1], domain); value = parts[0]
        } else {
          domain = defaultDomain; domainCandidates = domain ? [domain] : []; name = parts[0]; value = parts[1]
        }
      } else if (parts.length >= 3) {
        domainCandidates = domains.filter((item) => item.name.toLowerCase() === parts[2].toLowerCase())
        domain = domainCandidates[0]
        name = parts[0]; value = parts[1]
      }
      if (!domain) { errors.push(`第 ${index + 1} 行：无法确定托管域名`); return }
      if (!name || !value) { errors.push(`第 ${index + 1} 行：主机记录和记录值不能为空`); return }
      drafts.push({ key: `${domain.id}-${index}`, row: index + 1, domainId: domain.id, domainName: domain.name, domainCandidates, name, value, type: defaultType === 'auto' ? inferRecordType(value) : defaultType })
    })
    if (!drafts.length && !errors.length) errors.push('没有有效的解析记录')
    if (errors.length) { setParseError(errors.join('\n')); setRecords([]); return }
    setPreviewing(true); setParseError('')
    try {
      const next = await Promise.all(drafts.map(async (draft) => {
        const options = await getOptions(draft.domainId)
        const selectedLine = options.lines.find((item) => item.id === line || item.label.toLowerCase() === line.toLowerCase()) ?? options.lines.find((item) => item.id === '0' || item.label === '默认') ?? options.lines[0]
        if (!selectedLine) throw new Error(`${draft.domainName} 没有可用解析线路`)
        return { ...draft, lineId: selectedLine.id, lineLabel: selectedLine.label, ttl: Math.max(ttl || 600, options.minTtl), status: 'pending' as const }
      }))
      setRecords(next)
    } catch (nextError) { setParseError(nextError instanceof Error ? nextError.message : '读取域名配置失败'); setRecords([]) } finally { setPreviewing(false) }
  }

  async function selectDomainCandidate(domainName: string, domainId: number) {
    const selectedDomain = domains.find((domain) => domain.id === domainId)
    if (!selectedDomain) return
    setPreviewing(true); setParseError('')
    try {
      const options = await getOptions(domainId)
      const selectedLine = options.lines.find((item) => item.id === line || item.label.toLowerCase() === line.toLowerCase()) ?? options.lines.find((item) => item.id === '0' || item.label === '默认') ?? options.lines[0]
      if (!selectedLine) throw new Error(`${selectedDomain.name} 没有可用解析线路`)
      setRecords((current) => current.map((record) => record.domainName === domainName && record.domainCandidates.some((candidate) => candidate.id === domainId)
        ? { ...record, domainId, key: `${domainId}-${record.row - 1}`, lineId: selectedLine.id, lineLabel: selectedLine.label, ttl: Math.max(ttl || 600, options.minTtl), status: 'pending', message: undefined }
        : record))
    } catch (nextError) {
      setParseError(nextError instanceof Error ? nextError.message : '读取域名配置失败')
    } finally {
      setPreviewing(false)
    }
  }

  async function execute() {
    if (!records.length) return
    setRunning(true); setProgress(0)
    const next: ParsedRecord[] = records.map((record) => ({ ...record, status: 'pending', message: undefined }))
    const groups = new Map<string, ParsedRecord[]>()
    next.forEach((record) => {
      const key = `${record.domainId}\0${record.type}\0${record.lineId}\0${record.ttl}`
      groups.set(key, [...(groups.get(key) ?? []), record])
    })
    let completed = 0
    let success = 0
    for (const group of groups.values()) {
      group.forEach((record) => { record.status = 'running' })
      setRecords([...next])
      try {
        const response = await apiPost<DataResponse<OperationResult>>(`/api/web/v1/domains/${group[0].domainId}/records/bulk`, { recordsText: group.map((record) => `${record.name} ${record.value}`).join('\n'), type: group[0].type, lineId: group[0].lineId, ttl: group[0].ttl, mxPriority: 1, remark: null, proxied: false })
        const counts = operationCounts(response.message, group.length)
        success += counts.success
        group.forEach((record) => {
          record.status = counts.failed ? 'partial' : 'success'
          record.message = response.message ?? '添加成功'
        })
      } catch (nextError) {
        const message = nextError instanceof Error ? nextError.message : '添加失败'
        group.forEach((record) => { record.status = 'failed'; record.message = message })
      }
      completed += group.length; setProgress(Math.round((completed / next.length) * 100)); setRecords([...next])
    }
    setRunning(false)
    toast.add({ title: '智能解析执行完成', description: `成功 ${success} 条，失败 ${next.length - success} 条`, type: success === next.length ? 'success' : 'warning' })
  }

  const columns: DataColumn<ParsedRecord>[] = [
    { key: 'row', label: '行', render: (record) => record.row },
    { key: 'domain', label: '域名', render: (record) => <div><p className="font-medium">{record.domainName}</p><code className="text-xs text-muted-foreground">{record.name}</code></div> },
    { key: 'type', label: '类型', render: (record) => <Badge variant="outline">{record.type}</Badge> },
    { key: 'value', label: '记录值', render: (record) => <code className="block max-w-sm truncate">{record.value}</code> },
    { key: 'line', label: '线路 / TTL', render: (record) => `${record.lineLabel} / ${record.ttl}` },
    { key: 'status', label: '状态', render: (record) => record.status === 'running' ? <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Spinner />处理中</span> : <StatusBadge value={record.status} /> },
  ]
  const ambiguousDomains = Array.from(new Map(
    records.filter((record) => record.domainCandidates.length > 1).map((record) => [record.domainName, record]),
  ).values())

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
    <Card><CardHeader><CardTitle>批量解析数据</CardTitle><CardDescription>自动识别域名、主机记录和 A / AAAA / CNAME 类型，确认预览后再提交。</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Field><FieldLabel htmlFor="smart-records">解析内容</FieldLabel><Textarea id="smart-records" rows={10} value={text} onChange={(event) => setText(event.target.value)} placeholder={'www 192.0.2.1 example.com\n192.0.2.1 api.example.com\nwww 192.0.2.1\ncdn.example.com'} /><FieldDescription>支持“主机 值 域名”、“值 完整主机名”、“主机 值 + 默认域名”，或“完整主机名 + 统一记录值”。</FieldDescription></Field>{parseError ? <pre className="whitespace-pre-wrap rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{parseError}</pre> : null}<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void preview()} disabled={!text.trim() || previewing || running}>{previewing ? <Spinner data-icon="inline-start" /> : <WandSparklesIcon data-icon="inline-start" />}解析并预览</Button><Button onClick={() => void execute()} disabled={!records.length || running}>{running ? <Spinner data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}确认添加</Button></div>{running ? <Progress value={progress} /> : null}</CardContent></Card>
    <Card><CardHeader><CardTitle>默认参数</CardTitle><CardDescription>未在输入行中明确的参数使用这里的设置。</CardDescription></CardHeader><CardContent><FieldGroup><Field><FieldLabel>默认域名</FieldLabel><Select items={domains.map((domain) => ({ value: String(domain.id), label: domain.name }))} value={defaultDomainId || null} onValueChange={(value) => setDefaultDomainId(value ?? '')}><SelectTrigger className="w-full"><SelectValue placeholder="按完整主机名自动识别" /></SelectTrigger><SelectContent><SelectGroup>{domains.map((domain) => <SelectItem key={domain.id} value={String(domain.id)}>{domain.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel>记录类型</FieldLabel><Select items={[{ value: 'auto', label: '自动识别' }, ...['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'].map((value) => ({ value, label: value }))]} value={defaultType} onValueChange={(value) => setDefaultType(value ?? 'auto')}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="auto">自动识别</SelectItem>{['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel htmlFor="smart-line">线路名称或 ID</FieldLabel><Input id="smart-line" value={line} onChange={(event) => setLine(event.target.value)} placeholder="留空使用各域名默认线路" /></Field><Field><FieldLabel htmlFor="smart-ttl">TTL</FieldLabel><Input id="smart-ttl" type="number" min={1} value={ttl} onChange={(event) => setTtl(Number(event.target.value))} /></Field><Field><FieldLabel htmlFor="smart-value">统一记录值</FieldLabel><Input id="smart-value" value={batchValue} onChange={(event) => setBatchValue(event.target.value)} placeholder="用于每行只有完整主机名的格式" /></Field></FieldGroup></CardContent></Card>
    {records.length ? <Card className="xl:col-span-2"><CardHeader><CardTitle>解析预览</CardTitle><CardDescription>共 {records.length} 条，涉及 {new Set(records.map((record) => record.domainId)).size} 个域名。</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">{ambiguousDomains.length ? <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2"><div className="sm:col-span-2"><p className="text-sm font-medium">选择同名域名的 DNS 账户</p><p className="text-xs text-muted-foreground">同一域名由多个账户托管，请确认本次解析写入位置。</p></div>{ambiguousDomains.map((record) => <Field key={record.domainName}><FieldLabel>{record.domainName}</FieldLabel><Select items={record.domainCandidates.map((candidate) => ({ value: String(candidate.id), label: `${candidate.provider.accountLabel ?? candidate.provider.label} · #${candidate.id}` }))} value={String(record.domainId)} disabled={previewing || running} onValueChange={(value) => value && void selectDomainCandidate(record.domainName, Number(value))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{record.domainCandidates.map((candidate) => <SelectItem key={candidate.id} value={String(candidate.id)}>{candidate.provider.accountLabel ?? candidate.provider.label} · #{candidate.id}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>)}</div> : null}<DataTable rows={records} columns={columns} rowKey={(record) => record.key} emptyTitle="暂无预览" /></CardContent></Card> : null}
  </div>
}

async function searchDomainRecords(domain: DomainSummary, value: string): Promise<GlobalRecord[]> {
  async function load(parameters: Record<string, string | number>) {
    const records: DnsRecord[] = []
    let page = 1
    while (true) {
      const response = await apiGet<PageResponse<DnsRecord>>(`/api/web/v1/domains/${domain.id}/records`, { ...parameters, page, pageSize: 100 })
      records.push(...response.data)
      if (records.length >= response.meta.total || response.data.length === 0) return records
      page += 1
    }
  }
  let matches: DnsRecord[]
  if (domain.provider.type.toLowerCase() === 'qingcloud') {
    const parents = await load({})
    const children: DnsRecord[] = []
    for (const parent of parents) children.push(...await load({ subdomain: parent.id }))
    matches = children.filter((record) => recordMatchesValue(record, value))
  } else {
    matches = (await load({ value })).filter((record) => recordMatchesValue(record, value))
  }
  return matches.map((record) => ({ ...record, key: `${domain.id}:${record.id}`, domainId: domain.id, domainName: domain.name, provider: domain.provider.label }))
}

function GlobalSearch({ domains }: { domains: DomainSummary[] }) {
  const [value, setValue] = useState('')
  const [results, setResults] = useState<GlobalRecord[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searching, setSearching] = useState(false)
  const [editing, setEditing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('尚未搜索')
  const stop = useRef(false)

  async function search() {
    const keyword = value.trim()
    if (!keyword) return
    stop.current = false; setSearching(true); setResults([]); setSelected(new Set()); setProgress(0)
    const found: GlobalRecord[] = []
    let failed = 0
    for (let index = 0; index < domains.length; index += 1) {
      if (stop.current) break
      const domain = domains[index]
      setStatus(`正在搜索 ${domain.name}（${index + 1} / ${domains.length}）`)
      try { found.push(...await searchDomainRecords(domain, keyword)); setResults([...found]) } catch { failed += 1 }
      setProgress(Math.round(((index + 1) / domains.length) * 100))
    }
    setSearching(false)
    setStatus(`${stop.current ? '搜索已停止' : '搜索完成'}，找到 ${found.length} 条${failed ? `，${failed} 个域名失败` : ''}`)
    setSelected(new Set(found.map((record) => record.key)))
  }

  async function batchEdit(values: Record<string, unknown>, close: () => void) {
    setEditing(true)
    const rows = results.filter((record) => selected.has(record.key))
    const groups = new Map<number, GlobalRecord[]>()
    rows.forEach((record) => groups.set(record.domainId, [...(groups.get(record.domainId) ?? []), record]))
    let success = 0
    const errors: string[] = []
    const updated = new Set<string>()
    for (const [domainId, records] of groups) {
      try {
        const response = await apiPost<DataResponse<OperationResult>>(`/api/web/v1/domains/${domainId}/records/batch`, { action: 'value', type: String(values.type), value: String(values.value), records: records.map(recordSnapshot) })
        const counts = operationCounts(response.message, records.length)
        success += counts.success
        if (counts.success === records.length) records.forEach((record) => updated.add(record.key))
        else errors.push(`${records[0].domainName}：${response.message ?? `成功 ${counts.success} 条，失败 ${records.length - counts.success} 条`}`)
      } catch (nextError) { errors.push(`${records[0].domainName}：${nextError instanceof Error ? nextError.message : '修改失败'}`) }
    }
    setResults((current) => current.map((record) => updated.has(record.key) ? { ...record, type: String(values.type), value: String(values.value), values: undefined } : record))
    close()
    toast.add({ title: '跨域批量修改完成', description: `成功 ${success} 条，失败 ${rows.length - success} 条${errors.length ? `；${errors.slice(0, 3).join('；')}` : ''}`, type: success === rows.length ? 'success' : 'warning' })
    setEditing(false)
  }

  const columns: DataColumn<GlobalRecord>[] = [
    { key: 'domain', label: '域名', render: (record) => <div><p className="font-medium">{record.domainName}</p><p className="text-xs text-muted-foreground">{record.provider}</p></div> },
    { key: 'name', label: '主机记录', render: (record) => <code>{record.name}</code> },
    { key: 'type', label: '类型', render: (record) => <Badge variant="outline">{record.type}</Badge> },
    { key: 'value', label: '记录值', render: (record) => <code className="block max-w-md truncate">{record.value}</code> },
    { key: 'line', label: '线路', render: (record) => record.line.label },
    { key: 'ttl', label: 'TTL', render: (record) => record.ttl ?? '—' },
    { key: 'status', label: '状态', render: (record) => <StatusBadge value={record.status} /> },
  ]

  return <Card><CardHeader><CardTitle>按记录值搜索全部域名</CardTitle><CardDescription>逐个查询所有托管域名并执行精确值匹配；可选择结果跨域批量改为新的类型和值。</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void search() }}><div className="relative flex-1"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={value} onChange={(event) => setValue(event.target.value)} placeholder="例如 192.0.2.1" disabled={searching} /></div><Button type="submit" disabled={!value.trim() || searching}>{searching ? <Spinner data-icon="inline-start" /> : <SearchIcon data-icon="inline-start" />}搜索全部域名</Button>{searching ? <Button type="button" variant="outline" onClick={() => { stop.current = true; setStatus('正在停止，请等待当前域名完成…') }}><SquareIcon data-icon="inline-start" />停止</Button> : null}</form>{searching ? <Progress value={progress} /> : null}<div className="flex flex-wrap items-center gap-3"><span className="text-sm text-muted-foreground">{status}</span>{selected.size ? <FormDialog trigger={<Button className="ml-auto" size="sm" variant="outline"><PencilIcon data-icon="inline-start" />批量修改 {selected.size} 条</Button>} title="跨域批量修改解析记录" fields={[{ name: 'type', label: '新记录类型', kind: 'select', options: globalEditRecordTypes, required: true }, { name: 'value', label: '新记录值', kind: 'textarea', required: true }]} initialValues={{ type: results.find((record) => selected.has(record.key))?.type ?? 'A' }} pending={editing} onSubmit={(values, close) => void batchEdit(values, close)} /> : null}</div>{results.length ? <DataTable rows={results} columns={columns} rowKey={(record) => record.key} selected={selected} onSelectedChange={setSelected} emptyTitle="未找到匹配记录" /> : !searching ? <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">输入完整记录值开始搜索</div> : null}</CardContent></Card>
}

function CrossDomainBatch({ mode, domains, initialIds }: { mode: 'add' | 'edit'; domains: DomainSummary[]; initialIds: Set<string> }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(domains.filter((domain) => initialIds.has(String(domain.id))).map((domain) => String(domain.id))))
  const [results, setResults] = useState<DomainBatchResult[]>([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const targets = domains.filter((domain) => selected.has(String(domain.id)))
  const domainColumns: DataColumn<DomainSummary>[] = [
    { key: 'domain', label: '域名', render: (domain) => <div><p className="font-medium">{domain.name}</p><p className="text-xs text-muted-foreground">{domain.provider.accountLabel ?? domain.provider.label}</p></div> },
    { key: 'provider', label: '服务商', render: (domain) => domain.provider.label },
    { key: 'records', label: '记录数', render: (domain) => domain.recordCount },
  ]
  const resultColumns: DataColumn<DomainBatchResult>[] = [
    { key: 'domain', label: '域名', render: (item) => <div><p className="font-medium">{item.domain}</p><p className="text-xs text-muted-foreground">{item.provider}</p></div> },
    { key: 'status', label: '状态', render: (item) => item.status === 'running' ? <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Spinner />处理中</span> : <StatusBadge value={item.status} /> },
    { key: 'message', label: '结果', render: (item) => <span className={item.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{item.message ?? '等待执行'}</span> },
  ]

  async function execute(values: Record<string, unknown>, close: () => void) {
    if (!targets.length) return
    const next: DomainBatchResult[] = targets.map((domain) => ({ id: domain.id, domain: domain.name, provider: domain.provider.label, status: 'pending' }))
    setResults(next); setRunning(true); setProgress(0)
    let success = 0
    for (let index = 0; index < targets.length; index += 1) {
      const domain = targets[index]
      next[index] = { ...next[index], status: 'running' }; setResults([...next])
      try {
        const response = mode === 'add'
          ? await apiPost<DataResponse<OperationResult>>(`/api/web/v1/domains/${domain.id}/records/bulk`, {
              recordsText: String(values.recordsText),
              type: values.type === 'auto' ? undefined : values.type,
              lineId: null,
              ttl: Number(values.ttl ?? 600),
              mxPriority: Number(values.mxPriority ?? 10),
              remark: null,
              proxied: Boolean(values.proxied),
            })
          : await apiPatch<DataResponse<OperationResult>>(`/api/web/v1/domains/${domain.id}/records/by-name`, {
              name: values.name,
              type: values.type,
              value: values.value,
              ttl: Number(values.ttl ?? 0),
              mxPriority: Number(values.mxPriority ?? 0),
            })
        next[index] = { ...next[index], status: 'success', message: response.message ?? '操作成功' }
        success += 1
      } catch (error) {
        next[index] = { ...next[index], status: 'failed', message: error instanceof Error ? error.message : '操作失败' }
      }
      setResults([...next]); setProgress(Math.round(((index + 1) / targets.length) * 100))
    }
    setRunning(false); close()
    toast.add({ title: mode === 'add' ? '跨域批量添加完成' : '跨域批量修改完成', description: `成功 ${success} 个域名，失败 ${targets.length - success} 个`, type: success === targets.length ? 'success' : 'warning' })
  }

  const fields = mode === 'add' ? [
    { name: 'recordsText', label: '主机记录与记录值', kind: 'textarea' as const, description: '每行一条，主机记录与记录值用空格分隔。', required: true },
    { name: 'type', label: '记录类型', kind: 'select' as const, options: [{ value: 'auto', label: '自动识别 A / AAAA / CNAME' }, ...['A', 'AAAA', 'CNAME', 'NS', 'MX', 'SRV', 'TXT', 'CAA'].map((value) => ({ value, label: value }))], required: true },
    { name: 'ttl', label: 'TTL', kind: 'number' as const, min: 1, required: true },
    { name: 'mxPriority', label: 'MX 优先级', kind: 'number' as const, min: 0, max: 65535, visible: (values: Record<string, unknown>) => values.type === 'MX' },
    { name: 'proxied', label: 'Cloudflare 域名启用代理', kind: 'switch' as const },
  ] : [
    { name: 'name', label: '已有主机记录', placeholder: '@ 或 www', required: true },
    { name: 'type', label: '新记录类型', kind: 'select' as const, options: ['A', 'AAAA', 'CNAME', 'NS', 'MX', 'SRV', 'TXT', 'CAA'].map((value) => ({ value, label: value })), required: true },
    { name: 'value', label: '新记录值', kind: 'textarea' as const, required: true },
    { name: 'ttl', label: 'TTL（0 表示不修改）', kind: 'number' as const, min: 0 },
    { name: 'mxPriority', label: 'MX 优先级（0 表示不修改）', kind: 'number' as const, min: 0, max: 65535 },
  ]

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,.65fr)]"><Card><CardHeader><CardTitle>选择目标域名</CardTitle><CardDescription>可跨服务商顺序执行；每个域名的结果会单独保留。</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><div className="flex flex-wrap items-center gap-2"><span className="mr-auto text-sm text-muted-foreground">已选择 {selected.size} / {domains.length} 个域名</span><Button size="sm" variant="ghost" onClick={() => setSelected(new Set(domains.map((domain) => String(domain.id))))}>全选</Button><Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>清空</Button><FormDialog trigger={<Button size="sm" disabled={!selected.size}>{mode === 'add' ? <PlusIcon data-icon="inline-start" /> : <PencilIcon data-icon="inline-start" />}{mode === 'add' ? '填写并添加' : '填写并修改'}</Button>} title={mode === 'add' ? '跨域批量添加解析' : '跨域批量修改解析'} description={`将对选中的 ${selected.size} 个域名依次执行。`} fields={fields} initialValues={mode === 'add' ? { type: 'auto', ttl: 600, mxPriority: 10, proxied: false } : { type: 'A', ttl: 0, mxPriority: 0 }} pending={running} onSubmit={(values, close) => void execute(values, close)} /></div><DataTable rows={domains} columns={domainColumns} rowKey={(domain) => String(domain.id)} selected={selected} onSelectedChange={setSelected} emptyTitle="暂无可操作域名" /></CardContent></Card><Card><CardHeader><CardTitle>执行结果</CardTitle><CardDescription>{results.length ? `已处理 ${results.filter((item) => item.status === 'success' || item.status === 'failed').length} / ${results.length}` : '提交后在这里查看每个域名的结果。'}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">{running ? <Progress value={progress} /> : null}{results.length ? <DataTable rows={results} columns={resultColumns} rowKey={(item) => String(item.id)} emptyTitle="暂无结果" /> : <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">尚未执行</div>}</CardContent></Card></div>
}

export function RecordToolsPage() {
  const [searchParams] = useSearchParams()
  const domains = useQuery({ queryKey: ['domains', 'all-record-tools'], queryFn: loadAllDomains })
  const requestedTab = searchParams.get('tab')
  const initialTab = requestedTab === 'batch-add' || requestedTab === 'batch-edit' || requestedTab === 'search' ? requestedTab : 'smart'
  const initialIds = new Set((searchParams.get('domains') ?? '').split(',').filter((value) => /^\d+$/.test(value)))
  return <div className="flex flex-col gap-6"><PageHeader eyebrow="DNS Tools" title="高级解析工具" description="跨域批量添加与修改、智能解析和全域记录搜索。" />{domains.isError ? <QueryError error={domains.error} retry={() => void domains.refetch()} /> : domains.isPending ? <LoadingTable /> : <Tabs defaultValue={initialTab}><TabsList variant="line"><TabsTrigger value="batch-add">批量添加</TabsTrigger><TabsTrigger value="batch-edit">批量修改</TabsTrigger><TabsTrigger value="smart">智能解析</TabsTrigger><TabsTrigger value="search">全域搜索</TabsTrigger></TabsList><TabsContent value="batch-add"><CrossDomainBatch mode="add" domains={domains.data} initialIds={initialIds} /></TabsContent><TabsContent value="batch-edit"><CrossDomainBatch mode="edit" domains={domains.data} initialIds={initialIds} /></TabsContent><TabsContent value="smart"><SmartParse domains={domains.data} /></TabsContent><TabsContent value="search"><GlobalSearch domains={domains.data} /></TabsContent></Tabs>}</div>
}
