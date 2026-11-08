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

export async function searchDomainRecords(
  domain: DomainSummary,
  value: string,
  mode: RecordValueMatchMode = 'exact',
): Promise<GlobalRecord[]> {
  const keyword = value.trim()
  if (!keyword) return []

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

  const providerType = domain.provider.type.toLowerCase()
  const matchesValue = (record: DnsRecord) => {
    if (mode === 'contains') return recordMatchesValue(record, keyword, mode)
    const normalize = (item: string) => recordValueForDisplay(providerType, record.type, item)
    return recordMatchesValue({ value: normalize(record.value), values: record.values?.map(normalize) }, normalize(keyword), mode)
  }
  let matches: DnsRecord[]
  if (providerType === 'qingcloud') {
    const parents = await load({})
    const children: DnsRecord[] = []
    for (const parent of parents) children.push(...await load({ subdomain: parent.id }))
    matches = children.filter(matchesValue)
  } else {
    // Provider-side value filters may be exact-only. Load every page for
    // contains matching; Huawei also needs client-side filtering in exact mode.
    const parameters: Record<string, string | number> = mode === 'contains' || providerType === 'huawei' ? {} : { value: keyword }
    matches = (await load(parameters)).filter(matchesValue)
  }
  return matches.map((record) => ({ ...record, key: `${domain.id}:${record.id}`, domainId: domain.id, domainName: domain.name, provider: domain.provider.label, providerType: domain.provider.type }))
}
