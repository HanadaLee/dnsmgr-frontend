import type { DomainSummary } from '@/api/types'
import { BATCH_LIMIT, emptyRecordDraft, normalizedDomain, type RecordDraft } from '@/lib/batch-operations'

export const RECORD_HEADERS = [
  '域名 ID',
  '域名',
  '主机记录',
  '记录类型',
  '记录值',
  '线路',
  'TTL',
  'MX 优先级',
  '权重',
  '备注',
]
export type ImportedRecord = { domainId?: number; domain: string; draft: RecordDraft }

export function parseRecordRows(rows: unknown[][]): ImportedRecord[] {
  const nonempty = rows.filter((row) => row.some((cell) => String(cell ?? '').trim()))
  if (nonempty.length < 2) throw new Error('文件没有记录；请先下载模板并保留表头')
  if (nonempty.length - 1 > BATCH_LIMIT) throw new Error(`单次最多导入 ${BATCH_LIMIT} 条记录`)
  const headers = nonempty[0].map((cell) => String(cell).trim())
  for (const required of ['主机记录', '记录类型', '记录值']) {
    if (!headers.includes(required)) throw new Error(`缺少表头“${required}”，请使用下载的模板`)
  }
  return nonempty.slice(1).map((row, index) => {
    const cell = (header: string) => String(row[headers.indexOf(header)] ?? '')
    const domainId = cell('域名 ID').trim()
    if (domainId && !/^[1-9]\d*$/.test(domainId)) throw new Error(`第 ${index + 2} 行的域名 ID 不合法`)
    return {
      domainId: domainId ? Number(domainId) : undefined,
      domain: normalizedDomain(cell('域名')),
      draft: {
        ...emptyRecordDraft(`import-${index}`),
        name: cell('主机记录').trim(),
        type: cell('记录类型').trim().toUpperCase(),
        value: cell('记录值'),
        line: cell('线路').trim(),
        ttl: cell('TTL').trim() || '600',
        mxPriority: cell('MX 优先级').trim() || '10',
        weight: cell('权重').trim() || '0',
        remark: cell('备注'),
      },
    }
  })
}

export function importTargets(row: ImportedRecord, domains: DomainSummary[]): DomainSummary[] {
  if (row.domainId !== undefined && (!Number.isSafeInteger(row.domainId) || row.domainId < 1))
    throw new Error('域名 ID 必须是正整数')
  const targetName = normalizedDomain(row.domain)
  const candidates = domains.filter(
    (domain) =>
      (!row.domainId || domain.id === row.domainId) && (!targetName || normalizedDomain(domain.name) === targetName),
  )
  if (!targetName && !row.domainId && domains.length !== 1) throw new Error('选择多个域名时，每行必须填写域名或域名 ID')
  if (candidates.length !== 1)
    throw new Error(`${row.domain || row.domainId || '当前行'} 无法唯一匹配所选域名，请填写域名 ID 以区分 DNS 账户`)
  return candidates
}

export async function readRecordFile(file: File): Promise<ImportedRecord[]> {
  if (!/\.(xlsx|xls|csv|tsv)$/i.test(file.name)) throw new Error('请选择 XLSX、XLS、CSV 或 TSV 文件')
  if (file.size > 10 * 1024 * 1024) throw new Error('文件不能超过 10 MB')
  const XLSX = await import('xlsx')
  const delimited = /\.(csv|tsv)$/i.test(file.name)
  const workbook = delimited
    ? XLSX.read(await file.text(), { type: 'string', raw: true, ...(/\.tsv$/i.test(file.name) ? { FS: '\t' } : {}) })
    : XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('文件没有工作表')
  return parseRecordRows(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' }))
}

export async function downloadSheet(name: string, headers: string[], rows: unknown[][]) {
  const XLSX = await import('xlsx')
  // All cells are strings, including values starting with '='. Never create spreadsheet formulas.
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows].map((row) => row.map((cell) => String(cell ?? ''))))
  sheet['!cols'] = headers.map((header) => ({ wch: header.includes('值') ? 45 : 22 }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, '批量操作')
  XLSX.writeFile(workbook, `${name}.xlsx`)
}
