import { describe, expect, it, vi } from 'vitest'
import type { DomainSummary } from '@/api/types'
import { downloadSheet, importTargets, parseRecordRows, readRecordFile, RECORD_HEADERS } from '@/lib/batch-files'

vi.mock('xlsx', async (original) => ({ ...(await original<object>()), writeFile: vi.fn() }))

const domain: DomainSummary = {
  id: 12,
  name: 'example.com',
  provider: { type: 'dnspod', label: 'DNSPod' },
  recordCount: 0,
  expiryLookup: 'unknown',
  noticeEnabled: false,
  hidden: false,
  ssoEnabled: false,
}

describe('record import structure', () => {
  it('preserves independent row values, TXT spaces and zero priority/weight', () => {
    const rows = parseRecordRows([
      RECORD_HEADERS,
      ['12', 'EXAMPLE.COM.', 'www', 'a', '192.0.2.1', '电信', 600, 0, 0, ''],
      ['12', 'example.com', '_test', 'TXT', 'v=spf1 include:edge.example.com ~all', '', 1200, 10, 0, 'test'],
    ])
    expect(rows[0]).toMatchObject({
      domainId: 12,
      domain: 'example.com',
      draft: { type: 'A', mxPriority: '0', weight: '0', value: '192.0.2.1' },
    })
    expect(rows[1].draft.value).toBe('v=spf1 include:edge.example.com ~all')
    expect(new Set(rows.map((row) => row.draft.key)).size).toBe(2)
  })
  it('does not silently accept headerless, empty or oversized input', () => {
    expect(() =>
      parseRecordRows([
        ['www', 'A', '192.0.2.1'],
        ['api', 'A', '192.0.2.2'],
      ]),
    ).toThrow('缺少表头')
    expect(() => parseRecordRows([RECORD_HEADERS])).toThrow('没有记录')
    expect(() =>
      parseRecordRows([
        RECORD_HEADERS,
        ...Array.from({ length: 5001 }, () => ['12', 'example.com', '@', 'A', '192.0.2.1']),
      ]),
    ).toThrow('5000')
  })
  it('requires target domains for multi-zone imports and exact account identity for duplicate names', () => {
    const row = parseRecordRows([RECORD_HEADERS, ['', '', '@', 'A', '192.0.2.1']])[0]
    expect(importTargets(row, [domain])).toEqual([domain])
    const duplicate = { ...domain, id: 13 }
    expect(() => importTargets(row, [domain, duplicate])).toThrow('每行必须填写')
    expect(() => importTargets({ ...row, domain: 'example.com' }, [domain, duplicate])).toThrow('域名 ID')
    expect(importTargets({ ...row, domain: 'example.com', domainId: 13 }, [domain, duplicate])).toEqual([duplicate])
    expect(() => importTargets({ ...row, domain: 'wrong.com', domainId: 13 }, [domain, duplicate])).toThrow(
      '无法唯一匹配',
    )
  })
  it.each(['xlsx', 'csv', 'tsv'])('parses a %s file without collapsing independent values', async (format) => {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        RECORD_HEADERS,
        ['12', 'example.com', '@', 'TXT', 'v=spf1 include:test.example ~all', '0', '600', '0', '0', ''],
      ]),
      'Records',
    )
    const content =
      format === 'tsv'
        ? new TextEncoder().encode(XLSX.utils.sheet_to_csv(workbook.Sheets.Records, { FS: '\t' }))
        : new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: format === 'xlsx' ? 'xlsx' : 'csv' }))
    const rows = await readRecordFile(new File([content], `records.${format}`))
    expect(rows[0]).toMatchObject({
      domainId: 12,
      draft: { value: 'v=spf1 include:test.example ~all', mxPriority: '0', weight: '0' },
    })
  })
  it('exports string cells including formula-looking TXT and round-trips template headers', async () => {
    const XLSX = await import('xlsx')
    await downloadSheet('test', RECORD_HEADERS, [[12, 'example.com', '@', 'TXT', '=not-a-formula', '0', 600, 0, 0, '']])
    const workbook = vi.mocked(XLSX.writeFile).mock.calls.at(-1)![0]
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    expect(sheet.E2).toEqual({ t: 's', v: '=not-a-formula' })
    expect(sheet.A2).toEqual({ t: 's', v: '12' })
    expect(parseRecordRows(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false }))[0].draft.value).toBe(
      '=not-a-formula',
    )
  })
})
