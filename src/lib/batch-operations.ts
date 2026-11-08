import type { DnsRecord, DomainSummary, RecordOptions } from '@/api/types'
import { recordValueForDisplay, recordValueForSave, recordValuesForSave } from '@/lib/dns-record-value'
import type { GlobalRecord } from '@/lib/record-search'

export const BATCH_LIMIT = 5000
export const RECORD_TYPES = [
  'A',
  'AAAA',
  'CNAME',
  'MX',
  'NS',
  'TXT',
  'SRV',
  'CAA',
  'REDIRECT_URL',
  'FORWARD_URL',
  'LOC',
  'PTR',
  'LUA',
]
export type BatchTask =
  | 'add-domain'
  | 'add-record'
  | 'modify-record'
  | 'delete-record'
  | 'import-record'
  | 'export-record'
  | 'export-domain'
  | 'delete-domain'
  | 'log'
export const BATCH_TASKS: Array<{ value: BatchTask; label: string }> = [
  { value: 'add-domain', label: '添加域名' },
  { value: 'add-record', label: '添加记录' },
  { value: 'modify-record', label: '修改记录' },
  { value: 'delete-record', label: '删除记录' },
  { value: 'import-record', label: '导入记录' },
  { value: 'export-record', label: '导出记录' },
  { value: 'export-domain', label: '导出域名' },
  { value: 'delete-domain', label: '删除域名' },
  { value: 'log', label: '操作日志' },
]

export function batchTaskFromQuery(value: string | null): BatchTask {
  if (value === 'batch-add' || value === 'smart') return value === 'smart' ? 'import-record' : 'add-record'
  if (value === 'batch-edit') return 'modify-record'
  if (value === 'search' || value === 'query-record') return 'modify-record'
  return BATCH_TASKS.some((task) => task.value === value) ? (value as BatchTask) : 'modify-record'
}

export function normalizedDomain(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '')
}

export function domainNamesFromText(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,，;；]+/)
        .map(normalizedDomain)
        .filter(Boolean),
    ),
  ]
}

export function resolveDomainScope(text: string, domains: DomainSummary[], explicitIds?: number[]) {
  const names = domainNamesFromText(text)
  const selected: DomainSummary[] = []
  const errors: string[] = []
  for (const name of names) {
    const candidates = domains.filter((domain) => normalizedDomain(domain.name) === name)
    if (!candidates.length) {
      errors.push(`${name} 不在托管域名列表中`)
      continue
    }
    const resolved = explicitIds ? candidates.filter((domain) => explicitIds.includes(domain.id)) : candidates
    if (!resolved.length) errors.push(`${name} 未选择 DNS 账户`)
    else if (!explicitIds && resolved.length > 1) errors.push(`${name} 存在多个 DNS 账户，请从列表中明确选择`)
    else selected.push(...resolved)
  }
  return { domains: selected, errors }
}

export type DomainSelection = {
  mode: 'specified' | 'group' | 'all'
  text: string
  explicitIds?: number[]
  group: string
}
export function selectedDomains(selection: DomainSelection, domains: DomainSummary[]) {
  if (selection.mode === 'all') return { domains, errors: [] as string[] }
  if (selection.mode === 'group') {
    return {
      domains: domains.filter((domain) => String(domain.categoryId ?? 0) === selection.group),
      errors: selection.group ? [] : ['请选择域名分组'],
    }
  }
  return resolveDomainScope(selection.text, domains, selection.explicitIds)
}

export type RecordDraft = {
  key: string
  name: string
  type: string
  value: string
  line: string
  ttl: string
  mxPriority: string
  weight: string
  remark: string
}

export function emptyRecordDraft(key: string): RecordDraft {
  return { key, name: '@', type: 'A', value: '', line: '', ttl: '600', mxPriority: '10', weight: '0', remark: '' }
}

export function draftFromRecord(record: GlobalRecord): RecordDraft {
  return {
    key: record.key,
    name: record.name,
    type: record.type,
    value: recordValueForDisplay(record.providerType, record.type, record.value),
    line: record.line.id,
    ttl: String(record.ttl ?? 600),
    mxPriority: String(record.mxPriority ?? 1),
    weight: String(record.weight ?? 0),
    remark: record.remark ?? '',
  }
}

export type RecordChanges = Partial<Omit<RecordDraft, 'key'>>
export function applyRecordChanges(
  draft: RecordDraft,
  changes: RecordChanges,
  replace?: { find: string; value: string },
): RecordDraft {
  const next = { ...draft, ...changes }
  if (replace?.find) next.value = next.value.split(replace.find).join(replace.value)
  return next
}

export function recordDraftChanged(record: GlobalRecord, draft: RecordDraft): boolean {
  const before = draftFromRecord(record)
  return (Object.keys(before) as Array<keyof RecordDraft>).some(
    (field) => field !== 'key' && before[field] !== draft[field],
  )
}

export function recordSnapshot(record: DnsRecord, providerType: string) {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    value: recordValueForSave(providerType, record.type, record.value),
    values: recordValuesForSave(providerType, record.type, record.values),
    lineId: record.line.id,
    ttl: record.ttl ?? 600,
    mxPriority: record.mxPriority ?? 1,
    weight: record.weight ?? 0,
    mode: record.mode,
    parentId: record.parentId,
    remark: record.remark ?? null,
  }
}

export type BatchPlan = {
  key: string
  domainId: number
  domainName: string
  provider: string
  name: string
  action: 'add-record' | 'modify-record' | 'delete-record' | 'add-domain' | 'delete-domain'
  method: 'POST' | 'PATCH' | 'DELETE'
  path: string
  body?: Record<string, unknown>
  before?: string
  after?: string
  issues: string[]
  dependsOn?: string
}

function integerIssue(value: string, label: string, min: number, max: number): string | undefined {
  return !value.trim() || !Number.isInteger(Number(value)) || Number(value) < min || Number(value) > max
    ? `${label} 必须是 ${min}–${max} 的整数`
    : undefined
}

export function recordPlan(
  domain: DomainSummary,
  draft: RecordDraft,
  options: RecordOptions,
  current?: GlobalRecord,
): BatchPlan {
  const issues: string[] = []
  const type = draft.type.trim().toUpperCase()
  const line =
    options.lines.find((item) => item.id === draft.line || item.label === draft.line) ??
    (!draft.line
      ? (options.lines.find((item) => item.id === '0' || item.label === '默认') ?? options.lines[0])
      : undefined)
  if (!draft.name.trim() || draft.name.trim().length > 255) issues.push('主机记录不能为空且不能超过 255 个字符')
  if (!options.recordTypes.includes(type)) issues.push(`当前服务商不支持 ${type} 记录`)
  if (!draft.value.trim() || draft.value.length > 16_384) issues.push('记录值不能为空且不能超过 16384 个字符')
  if (!line) issues.push(`无法匹配线路 ${draft.line || '默认'}，不会自动替换为其他线路`)
  if (draft.remark.length > 1000) issues.push('备注不能超过 1000 个字符')
  if (!current && options.capabilities.recordRemark === 'separate' && draft.remark)
    issues.push('当前服务商新增记录不能同时保存备注，请先留空；创建后可在“修改记录”中单独设置备注')
  if (options.capabilities.recordRemark === 'none' && draft.remark && draft.remark !== (current?.remark ?? ''))
    issues.push('当前服务商不支持记录备注')
  if (
    !options.capabilities.recordWeight &&
    !options.capabilities.hierarchicalRecords &&
    Number(draft.weight) !== (current?.weight ?? 0)
  )
    issues.push('当前服务商不支持记录权重')
  if (
    options.capabilities.hierarchicalRecords &&
    current?.mode === 3 &&
    (Number(draft.weight) < 1 || Number(draft.weight) > 99)
  )
    issues.push('青云权重模式的权重必须为 1–99')
  for (const issue of [
    integerIssue(draft.ttl, 'TTL', Math.max(1, options.minTtl), 2_147_483_647),
    integerIssue(draft.mxPriority, '优先级', 0, 65_535),
    integerIssue(draft.weight, '权重', 0, 100),
  ]) {
    if (issue) issues.push(issue)
  }
  const providerType = domain.provider.type
  const value = recordValueForSave(providerType, type, draft.value.trim())
  // Cloudflare's adapter emulates disabled records with a _pause hostname suffix.
  // Sending the displayed name unchanged would unintentionally re-enable the record.
  const name =
    providerType.toLowerCase() === 'cloudflare' && current?.status === 'disabled'
      ? `${draft.name.trim() === '@' ? '__root__' : draft.name.trim()}_pause`
      : draft.name.trim()
  const body = {
    name,
    type,
    value,
    lineId: line?.id ?? draft.line,
    ttl: Number(draft.ttl),
    mxPriority: Number(draft.mxPriority),
    weight: Number(draft.weight),
    remark: draft.remark || null,
    ...(current?.mode === undefined
      ? options.capabilities.hierarchicalRecords && (type === 'A' || type === 'CNAME')
        ? { mode: 1 }
        : {}
      : { mode: current.mode }),
    ...(current?.parentId ? { parentId: current.parentId } : {}),
    ...(current ? { current: recordSnapshot(current, providerType) } : {}),
  }
  return {
    key: current?.key ?? `${domain.id}:${draft.key}`,
    domainId: domain.id,
    domainName: domain.name,
    provider: domain.provider.accountLabel ?? domain.provider.label,
    name: draft.name,
    action: current ? 'modify-record' : 'add-record',
    method: current ? 'PATCH' : 'POST',
    path: `/api/web/v1/domains/${domain.id}/records${current ? `/${encodeURIComponent(current.id)}` : ''}`,
    body,
    before: current
      ? `${current.name} · ${current.type} ${recordValueForDisplay(providerType, current.type, current.value)} · 线路 ${current.line.label} · TTL ${current.ttl ?? 600} · MX ${current.mxPriority ?? 1} · 权重 ${current.weight ?? 0} · 备注 ${current.remark || '无'}`
      : undefined,
    after: `${draft.name} · ${type} ${draft.value} · 线路 ${line?.label ?? draft.line} · TTL ${draft.ttl} · MX ${draft.mxPriority} · 权重 ${draft.weight} · 备注 ${draft.remark || '无'}`,
    issues,
  }
}

export function recordUpdatePlans(
  domain: DomainSummary,
  draft: RecordDraft,
  options: RecordOptions,
  current: GlobalRecord,
): BatchPlan[] {
  if (!recordDraftChanged(current, draft)) return []
  if (options.capabilities.recordRemark !== 'separate' || draft.remark === (current.remark ?? ''))
    return [recordPlan(domain, draft, options, current)]
  const withoutRemark = { ...draft, remark: current.remark ?? '' }
  const plans = recordDraftChanged(current, withoutRemark) ? [recordPlan(domain, withoutRemark, options, current)] : []
  plans.push({
    key: `remark:${current.key}`,
    domainId: domain.id,
    domainName: domain.name,
    provider: domain.provider.accountLabel ?? domain.provider.label,
    name: draft.name,
    action: 'modify-record',
    method: 'PATCH',
    path: `/api/web/v1/domains/${domain.id}/records/${encodeURIComponent(current.id)}/remark`,
    body: { remark: draft.remark || null },
    before: `${current.name} · 备注 ${current.remark || '无'}`,
    after: `${draft.name} · 备注 ${draft.remark || '无'}`,
    issues: draft.remark.length > 1000 ? ['备注不能超过 1000 个字符'] : [],
    dependsOn: plans[0]?.key,
  })
  return plans
}

export function deleteRecordPlan(record: GlobalRecord): BatchPlan {
  return {
    key: record.key,
    domainId: record.domainId,
    domainName: record.domainName,
    provider: record.provider,
    name: record.name,
    action: 'delete-record',
    method: 'DELETE',
    path: `/api/web/v1/domains/${record.domainId}/records/${encodeURIComponent(record.id)}`,
    body: { current: recordSnapshot(record, record.providerType) },
    before: `${record.type} ${record.value}`,
    after: '删除记录',
    issues: [],
  }
}
