import { apiGet } from '@/api/client'
import type { DnsRecord, DomainSummary, PageResponse } from '@/api/types'
import { recordValueForDisplay } from '@/lib/dns-record-value'
import { recordMatchesValue, type RecordValueMatchMode } from '@/lib/record-tools'

export type GlobalRecord = DnsRecord & {
  key: string
  domainId: number
  domainName: string
  provider: string
  providerType: string
}

export type RecordFilters = {
  name?: string
  type?: string
  line?: string
  value?: string
  valueMode?: RecordValueMatchMode
  status?: string
}

async function readRecords(
  domain: DomainSummary,
  parameters: Record<string, string | number>,
  shouldStop: () => boolean,
): Promise<DnsRecord[]> {
  async function load(extra: Record<string, string | number> = {}) {
    const records: DnsRecord[] = []
    for (let page = 1; !shouldStop(); page += 1) {
      if (page > 10_000) throw new Error('服务返回的记录分页异常，请缩小查询范围后重试')
      const response = await apiGet<PageResponse<DnsRecord>>(`/api/web/v1/domains/${domain.id}/records`, {
        ...parameters,
        ...extra,
        page,
        pageSize: 100,
      })
      records.push(...response.data)
      if (records.length >= response.meta.total || !response.data.length) break
    }
    return records
  }
  if (domain.provider.type.toLowerCase() !== 'qingcloud') return load()
  const parents = await load()
  const children: DnsRecord[] = []
  for (const parent of parents) {
    if (shouldStop()) break
    children.push(
      ...(await load({ subdomain: parent.id })).map((child) => ({
        ...child,
        parentId: child.parentId ?? parent.id,
        mode: child.mode ?? parent.mode,
      })),
    )
  }
  return children
}

function decorate(domain: DomainSummary, records: DnsRecord[]): GlobalRecord[] {
  return records.map((record) => ({
    ...record,
    key: `${domain.id}:${record.id}`,
    domainId: domain.id,
    domainName: domain.name,
    provider: domain.provider.label,
    providerType: domain.provider.type,
  }))
}

export async function queryDomainRecords(
  domain: DomainSummary,
  filters: RecordFilters = {},
  shouldStop: () => boolean = () => false,
): Promise<GlobalRecord[]> {
  const value = filters.value?.trim() ?? ''
  const records = value
    ? await searchDomainRecords(domain, value, filters.valueMode ?? 'contains', shouldStop)
    : decorate(domain, await readRecords(domain, {}, shouldStop))
  const name = filters.name?.trim().toLowerCase().replace(/\.$/, '') ?? ''
  const line = filters.line?.trim().toLowerCase() ?? ''
  return records.filter((record) => {
    const hostname = record.name === '@' ? domain.name : `${record.name}.${domain.name}`
    return (
      (!name || record.name.toLowerCase().includes(name) || hostname.toLowerCase().includes(name)) &&
      (!filters.type || record.type === filters.type) &&
      (!line || record.line.id.toLowerCase() === line || record.line.label.toLowerCase().includes(line)) &&
      (!filters.status || record.status === filters.status)
    )
  })
}

export async function searchDomainRecords(
  domain: DomainSummary,
  value: string,
  mode: RecordValueMatchMode = 'exact',
  shouldStop: () => boolean = () => false,
): Promise<GlobalRecord[]> {
  const keyword = value.trim()
  if (!keyword) return []

  const providerType = domain.provider.type.toLowerCase()
  const matchesValue = (record: DnsRecord) => {
    if (mode === 'contains') return recordMatchesValue(record, keyword, mode)
    const normalize = (item: string) => recordValueForDisplay(providerType, record.type, item)
    return recordMatchesValue(
      { value: normalize(record.value), values: record.values?.map(normalize) },
      normalize(keyword),
      mode,
    )
  }
  // Provider value filters can be exact-only; QingCloud filters child records locally.
  const parameters: Record<string, string | number> =
    mode === 'contains' || providerType === 'huawei' || providerType === 'qingcloud' ? {} : { value: keyword }
  return decorate(domain, (await readRecords(domain, parameters, shouldStop)).filter(matchesValue))
}
