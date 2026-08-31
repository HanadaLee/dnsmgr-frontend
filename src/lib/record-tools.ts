import type { DnsRecord, DomainSummary } from '@/api/types'

export function managedDomainCandidates(hostname: string, domains: DomainSummary[]): DomainSummary[] {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  const matches = domains.filter((domain) => {
    const name = domain.name.toLowerCase()
    return normalized === name || normalized.endsWith(`.${name}`)
  })
  if (!matches.length) return []
  const longestName = Math.max(...matches.map((domain) => domain.name.length))
  return matches.filter((domain) => domain.name.length === longestName)
}

export function hostForManagedDomain(hostname: string, domain: DomainSummary): string {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  return normalized === domain.name.toLowerCase()
    ? '@'
    : normalized.slice(0, -(domain.name.length + 1))
}

export function inferRecordType(value: string): string {
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) return 'A'
  if (/^(?:[\da-f]{0,4}:){2,7}[\da-f]{0,4}$/i.test(value)) return 'AAAA'
  if (/^([a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,}$/i.test(value.replace(/\.$/, ''))) return 'CNAME'
  if (/^\d+$/.test(value) && Number(value) <= 65_535) return 'MX'
  return 'A'
}

export function recordMatchesValue(record: Pick<DnsRecord, 'value' | 'values'>, keyword: string): boolean {
  return record.values?.includes(keyword) ?? record.value === keyword
}
