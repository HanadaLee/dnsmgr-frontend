const HUAWEI_PROVIDER = 'huawei'
const TENCENT_PROVIDER = 'dnspod'
const TENCENT_ABSOLUTE_DOMAIN_RECORD_TYPES = new Set(['CNAME', 'NS', 'MX'])

function isHuaweiCname(providerType: string | undefined, recordType: string | undefined): boolean {
  return providerType?.toLowerCase() === HUAWEI_PROVIDER && recordType?.toUpperCase() === 'CNAME'
}

function hidesProviderTrailingDot(providerType: string | undefined, recordType: string | undefined): boolean {
  if (isHuaweiCname(providerType, recordType)) return true
  return providerType?.toLowerCase() === TENCENT_PROVIDER
    && TENCENT_ABSOLUTE_DOMAIN_RECORD_TYPES.has(recordType?.toUpperCase() ?? '')
}

export function recordValueForDisplay(providerType: string | undefined, recordType: string | undefined, value: string): string {
  if (!hidesProviderTrailingDot(providerType, recordType)) return value
  return value.split(',').map((item) => {
    const normalized = item.trim()
    return normalized.endsWith('.') ? normalized.slice(0, -1) : normalized
  }).join(',')
}

export function recordValueForSave(providerType: string | undefined, recordType: string | undefined, value: string): string {
  if (!isHuaweiCname(providerType, recordType)) return value
  return value.split(',').map((item) => {
    const normalized = item.trim()
    return normalized && !normalized.endsWith('.') ? `${normalized}.` : normalized
  }).join(',')
}

export function recordValuesForSave(providerType: string | undefined, recordType: string | undefined, values: string[] | undefined): string[] | undefined {
  return values?.map((value) => recordValueForSave(providerType, recordType, value))
}

function legacyInferredRecordType(value: string): 'A' | 'AAAA' | 'CNAME' {
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) return 'A'
  if (/^(?:[\da-f]{0,4}:){2,7}[\da-f]{0,4}$/i.test(value)) return 'AAAA'
  return 'CNAME'
}

export function bulkRecordTextForSave(providerType: string | undefined, recordType: unknown, source: string): string {
  if (providerType?.toLowerCase() !== HUAWEI_PROVIDER) return source
  const requestedType = String(recordType ?? '').toUpperCase()

  return source.split(/\r?\n/).map((line) => {
    const match = /^(\s*\S+\s+)(\S+)(.*)$/.exec(line)
    if (!match) return line
    const type = requestedType && requestedType !== 'AUTO' ? requestedType : legacyInferredRecordType(match[2])
    return `${match[1]}${recordValueForSave(providerType, type, match[2])}${match[3]}`
  }).join('\n')
}
