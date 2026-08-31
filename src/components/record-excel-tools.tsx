import { useMemo, useRef, useState } from 'react'
import { DownloadIcon, FileSpreadsheetIcon, UploadIcon } from 'lucide-react'

import { apiGet, apiPost } from '@/api/client'
import type { DataResponse, DnsRecord, OperationResult, PageResponse, RecordOptions } from '@/api/types'
import { DataTable, type DataColumn } from '@/components/data-table'
import { QueryError } from '@/components/query-error'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { recordValueForDisplay, recordValueForSave } from '@/lib/dns-record-value'

type ImportRecord = {
  row: number
  name: string
  type: string
  value: string
  lineId: string
  lineLabel: string
  requestedLine: string
  lineFallback: boolean
  ttl: number
  mxPriority: number
  weight: number
  remark: string | null
  error?: string
  result?: string
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    const item = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: unknown }> }
    if (Array.isArray(item.richText)) return item.richText.map((part) => String(part.text ?? '')).join('').trim()
    if (item.text !== undefined) return String(item.text).trim()
    if (item.result !== undefined) return String(item.result).trim()
  }
  return String(value).trim()
}

function canonicalLine(value: string): string {
  let name = value.trim().replace(/[\s/\\·•]+/g, '_').replace(/^_+|_+$/g, '')
  const aliases: Record<string, string> = {
    '默认线路': '默认', '默认_线路': '默认', '海外': '境外', '国外': '境外', '国内': '中国大陆',
    '中国大陆地区': '中国大陆', '电信线路': '电信', '联通线路': '联通', '移动线路': '移动',
  }
  name = name.replace(/中国(移动|联通|电信|教育网|广电|铁通|鹏博士|科技网)/g, '$1')
  return aliases[name] ?? name
}

function lineMatcher(options: RecordOptions) {
  const entries = options.lines.map((line) => ({ ...line, key: canonicalLine(line.label) }))
  const fallback = entries.find((line) => line.key === '默认' || line.id === '0') ?? entries[0]
  return (requested: string) => {
    const key = canonicalLine(requested)
    const match = entries.find((line) => line.key === key || line.id === requested) ?? fallback
    if (!match) return { id: '', label: '默认', fallback: Boolean(requested) }
    return { id: match.id, label: match.label, fallback: Boolean(requested) && match.key !== key }
  }
}

function getColumn(row: Map<string, unknown>, names: string[]): string {
  for (const name of names) {
    if (row.has(name)) return cellText(row.get(name))
  }
  return ''
}

async function readWorkbook(file: File, options: RecordOptions): Promise<ImportRecord[]> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('Excel 中没有工作表')
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '', raw: false })
  const matchLine = lineMatcher(options)
  const records: ImportRecord[] = []
  rows.forEach((excelRow, index) => {
    const rowNumber = index + 2
    const source = new Map(Object.entries(excelRow))
    const name = getColumn(source, ['主机记录', '主机名', 'Name', 'name'])
    let type = getColumn(source, ['记录类型', '类型', 'Type', 'type']).toUpperCase()
    const requestedLine = getColumn(source, ['线路类型', '线路', 'LineName', 'line'])
    let value = getColumn(source, ['记录值', 'Value', 'value'])
    const ttlText = getColumn(source, ['TTL', 'ttl'])
    const weightText = getColumn(source, ['权重', 'Weight', 'weight'])
    const remark = getColumn(source, ['备注', 'Remark', 'remark'])
    if (![name, type, requestedLine, value, ttlText, weightText].some(Boolean)) return
    if ((type === 'NS' || type === 'SOA') && name === '@') return
    if (type === '显性URL') type = 'REDIRECT_URL'
    if (type === '隐性URL') type = 'FORWARD_URL'
    let mxPriority = 1
    if (type === 'MX') {
      const match = value.match(/^(.*)\s+\|\s+(\d+)$/)
      if (match) { value = match[1]; mxPriority = Number(match[2]) }
    }
    const ttlCandidate = ttlText === '' ? Math.max(600, options.minTtl) : Number.parseInt(ttlText, 10)
    const ttl = Number.isFinite(ttlCandidate) ? Math.max(ttlCandidate, options.minTtl) : ttlCandidate
    const weightCandidate = weightText === '' ? 0 : Number.parseInt(weightText, 10)
    const line = matchLine(requestedLine)
    const errors: string[] = []
    if (!name) errors.push('主机记录为空')
    if (!type) errors.push('记录类型为空')
    else if (!options.recordTypes.includes(type)) errors.push(`当前服务商不支持 ${type} 记录`)
    if (!value) errors.push('记录值为空')
    if (!Number.isFinite(ttl)) errors.push('TTL 格式错误')
    if (mxPriority < 0 || mxPriority > 65_535) errors.push('MX 优先级超出范围')
    if (!Number.isFinite(weightCandidate) || weightCandidate < 0 || weightCandidate > 100) errors.push('权重格式错误')
    if (!line.id) errors.push('没有可用线路')
    records.push({ row: rowNumber, name, type, value, requestedLine: requestedLine || '默认', lineId: line.id, lineLabel: line.label, lineFallback: line.fallback, ttl, mxPriority, weight: Number.isFinite(weightCandidate) ? weightCandidate : 0, remark: remark || null, error: errors.join('；') || undefined })
  })
  return records
}

async function getAllRecords(domainId: number, onProgress: (loaded: number, total: number) => void) {
  const all: DnsRecord[] = []
  let page = 1
  while (true) {
    const response = await apiGet<PageResponse<DnsRecord>>(`/api/web/v1/domains/${domainId}/records`, { page, pageSize: 100 })
    all.push(...response.data)
    onProgress(all.length, response.meta.total)
    if (all.length >= response.meta.total || response.data.length === 0) return all
    page += 1
  }
}

async function createWorkbook(records: DnsRecord[], options: RecordOptions) {
  const XLSX = await import('xlsx')
  const headers = ['记录ID', '主机记录', '记录类型', '线路值', '线路类型', '记录值', 'TTL']
  if (options.capabilities.recordWeight) headers.push('权重')
  if (options.capabilities.recordRemark !== 'none') headers.push('备注')
  headers.push('更新时间', '状态')
  const data: Array<Array<string | number>> = [headers]
  for (const record of records) {
    const type = record.type === 'REDIRECT_URL' ? '显性URL' : record.type === 'FORWARD_URL' ? '隐性URL' : record.type
    const displayValue = recordValueForDisplay(options.providerType, record.type, record.value)
    const value = record.type === 'MX' ? `${displayValue} | ${record.mxPriority ?? 1}` : displayValue
    const row: Array<string | number> = [record.id, record.name, type, record.line.id, record.line.label, value, record.ttl ?? '',]
    if (options.capabilities.recordWeight) row.push(record.weight ?? 0)
    if (options.capabilities.recordRemark !== 'none') row.push(record.remark ?? '')
    row.push(record.updatedAt ?? '', record.status === 'enabled' ? '启用' : '暂停')
    data.push(row)
  }
  const sheet = XLSX.utils.aoa_to_sheet(data)
  sheet['!cols'] = headers.map((header) => ({ wch: header === '记录值' ? 35 : ['记录ID', '主机记录', '备注', '更新时间'].includes(header) ? 20 : 12 }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, '解析记录')
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer
}

function saveBuffer(buffer: ArrayBuffer | Uint8Array, filename: string) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : Uint8Array.from(buffer)
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function RecordExcelTools({ domainId, domainName, options, onImported }: { domainId: number; domainName: string; options: RecordOptions; onImported: () => void }) {
  const [open, setOpen] = useState(false)
  const [records, setRecords] = useState<ImportRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<unknown>()
  const input = useRef<HTMLInputElement>(null)
  const valid = records.filter((record) => !record.error)
  const columns = useMemo<DataColumn<ImportRecord>[]>(() => [
    { key: 'row', label: '行', render: (record) => record.row },
    { key: 'name', label: '主机记录', render: (record) => <code>{record.name || '—'}</code> },
    { key: 'type', label: '类型', render: (record) => record.type || '—' },
    { key: 'line', label: '线路', render: (record) => record.lineFallback ? `${record.requestedLine} → ${record.lineLabel}` : record.lineLabel },
    { key: 'value', label: '记录值', render: (record) => <code className="block max-w-72 truncate">{record.value || '—'}</code> },
    { key: 'result', label: '校验/结果', render: (record) => <span className={record.error ? 'text-destructive' : record.result?.includes('失败') ? 'text-destructive' : 'text-muted-foreground'}>{record.error ?? record.result ?? '待添加'}</span> },
  ], [])

  async function selectFile(file?: File) {
    if (!file) return
    setLoading(true); setError(undefined); setRecords([])
    try { setRecords(await readWorkbook(file, options)) } catch (nextError) { setError(nextError) } finally { setLoading(false) }
  }

  async function runImport() {
    if (!valid.length) return
    setImporting(true); setProgress(0)
    let success = 0
    const next = [...records]
    for (let index = 0; index < next.length; index += 1) {
      const record = next[index]
      if (record.error) { setProgress(Math.round(((index + 1) / next.length) * 100)); continue }
      try {
        await apiPost<DataResponse<OperationResult>>(`/api/web/v1/domains/${domainId}/records`, { name: record.name, type: record.type, value: recordValueForSave(options.providerType, record.type, record.value), lineId: record.lineId, ttl: record.ttl, mxPriority: record.mxPriority, weight: record.weight, remark: record.remark })
        record.result = '添加成功'; success += 1
      } catch (nextError) { record.result = `添加失败：${nextError instanceof Error ? nextError.message : '未知错误'}` }
      setRecords([...next]); setProgress(Math.round(((index + 1) / next.length) * 100))
    }
    setProgress(100)
    setImporting(false); onImported()
    toast.add({ title: 'Excel 导入完成', description: `成功 ${success} 条，失败 ${valid.length - success} 条`, type: success === valid.length ? 'success' : 'warning' })
  }

  return <div className="flex flex-wrap gap-2">
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setRecords([]); setError(undefined); setProgress(0) } }}>
      <DialogTrigger render={<Button variant="outline" />}><UploadIcon data-icon="inline-start" />导入 Excel</DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-5xl">
        <DialogHeader><DialogTitle>导入解析记录</DialogTitle><DialogDescription>读取首个工作表；支持主机记录、记录类型、线路类型、记录值、TTL、权重和备注列。</DialogDescription></DialogHeader>
        <Field><FieldLabel htmlFor="record-excel-file">Excel 文件</FieldLabel><Input ref={input} id="record-excel-file" type="file" accept=".xlsx,.xls" disabled={loading || importing} onChange={(event) => void selectFile(event.target.files?.[0])} /><FieldDescription>无法匹配的线路会回退到默认线路，并在预览中标明。</FieldDescription></Field>
        {loading ? <div className="flex items-center justify-center gap-2 rounded-lg border py-10 text-sm text-muted-foreground"><Spinner />正在解析 Excel…</div> : null}
        {error ? <QueryError error={error} retry={() => void selectFile(input.current?.files?.[0])} /> : null}
        {records.length ? <><div className="flex flex-wrap gap-3 text-sm text-muted-foreground"><span>共 {records.length} 条</span><span>可导入 {valid.length} 条</span><span>校验失败 {records.length - valid.length} 条</span></div><DataTable rows={records} columns={columns} rowKey={(record) => String(record.row)} emptyTitle="没有可导入记录" />{importing ? <Progress value={progress} /> : null}</> : null}
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={importing}>关闭</Button><Button onClick={() => void runImport()} disabled={!valid.length || importing}>{importing ? <Spinner data-icon="inline-start" /> : <FileSpreadsheetIcon data-icon="inline-start" />}导入 {valid.length || ''} 条</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <ExportButton domainId={domainId} domainName={domainName} options={options} />
  </div>
}

function ExportButton({ domainId, domainName, options }: { domainId: number; domainName: string; options: RecordOptions }) {
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState('')
  async function runExport() {
    setExporting(true); setProgress('正在查询解析记录…')
    try {
      const records = await getAllRecords(domainId, (loaded, total) => setProgress(`正在查询：${loaded}${total ? ` / ${total}` : ''} 条`))
      if (!records.length) { toast.add({ title: '没有可导出的解析记录', type: 'warning' }); return }
      setProgress(`正在生成 Excel，共 ${records.length} 条…`)
      const buffer = await createWorkbook(records, options)
      saveBuffer(buffer, `${domainName}_解析记录_${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast.add({ title: 'Excel 导出成功', description: `共 ${records.length} 条解析记录`, type: 'success' })
    } catch (nextError) { toast.add({ title: 'Excel 导出失败', description: nextError instanceof Error ? nextError.message : '未知错误', type: 'error' }) } finally { setExporting(false); setProgress('') }
  }
  return <Button variant="outline" onClick={() => void runExport()} disabled={exporting}>{exporting ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}{progress || '导出 Excel'}</Button>
}
