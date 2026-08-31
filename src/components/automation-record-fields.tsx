import { useQuery } from '@tanstack/react-query'

import { apiGet } from '@/api/client'
import type { AutomationDomainOption, DnsRecord, PageResponse } from '@/api/types'
import { FieldsEditor, type FormFieldSpec } from '@/components/form-dialog'
import { QueryError } from '@/components/query-error'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'

async function allRecords(domainId: number) {
  async function load(parameters: Record<string, string | number> = {}) {
    const records: DnsRecord[] = []
    let page = 1
    while (true) {
      const response = await apiGet<PageResponse<DnsRecord>>(`/api/web/v1/domains/${domainId}/records`, { ...parameters, page, pageSize: 100 })
      records.push(...response.data)
      if (records.length >= response.meta.total || response.data.length === 0) return records
      page += 1
    }
  }
  const records = await load()
  const parents = records.filter((record) => record.childCount !== undefined)
  if (!parents.length) return records
  const children: DnsRecord[] = []
  for (const parent of parents) children.push(...await load({ subdomain: parent.id }))
  return children
}

function optionLabel(record: DnsRecord) {
  return `${record.name} · ${record.type} · ${record.value}`
}

export function AutomationRecordFields({ domains, fields, values, onChange }: { domains: AutomationDomainOption[]; fields: FormFieldSpec[]; values: Record<string, unknown>; onChange: (values: Record<string, unknown>) => void }) {
  const domainId = Number(values.domainId)
  const records = useQuery({ queryKey: ['automation-records', domainId], queryFn: () => allRecords(domainId), enabled: Number.isInteger(domainId) && domainId > 0 })
  const selected = records.data?.find((record) => record.id === String(values.recordId))
  const recordOptions = (records.data ?? []).map((record) => ({ value: record.id, label: optionLabel(record) }))
  if (values.recordId && !recordOptions.some((option) => option.value === String(values.recordId))) {
    recordOptions.unshift({ value: String(values.recordId), label: `${String(values.recordName || values.recordId)} · 当前任务记录` })
  }
  return <FieldGroup>
    <Field><FieldLabel>域名</FieldLabel><Select items={domains.map((domain) => ({ value: String(domain.id), label: domain.name }))} value={values.domainId ? String(values.domainId) : null} onValueChange={(value) => onChange({ ...values, domainId: value ?? '', recordId: '', recordName: '', primaryValue: '', currentValue: '', currentValues: undefined, lineId: '', lineLabel: '', ttl: 600 })}><SelectTrigger className="w-full"><SelectValue placeholder="请选择域名" /></SelectTrigger><SelectContent><SelectGroup>{domains.map((domain) => <SelectItem key={domain.id} value={String(domain.id)}>{domain.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    <Field><FieldLabel>解析记录</FieldLabel><Select items={recordOptions} value={values.recordId ? String(values.recordId) : null} disabled={!domainId || records.isPending} onValueChange={(value) => { const record = records.data?.find((item) => item.id === value); if (!record) return; onChange({ ...values, recordId: record.id, recordName: record.name, primaryValue: record.values?.[0] ?? record.value, currentValue: record.value, currentValues: record.values, lineId: record.line.id, lineLabel: record.line.label, ttl: record.ttl ?? 600 }) }}><SelectTrigger className="w-full"><SelectValue placeholder={records.isPending ? '正在读取解析记录…' : '请选择解析记录'} /></SelectTrigger><SelectContent><SelectGroup>{recordOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent></Select>{records.isPending ? <FieldDescription className="inline-flex items-center gap-1"><Spinner />正在加载全部记录</FieldDescription> : selected ? <FieldDescription>{selected.line.label} · TTL {selected.ttl ?? '—'} · {selected.status === 'enabled' ? '已启用' : '已停用'}</FieldDescription> : null}</Field>
    {records.isError ? <QueryError error={records.error} retry={() => void records.refetch()} /> : null}
    <FieldsEditor fields={fields} values={values} onChange={onChange} />
  </FieldGroup>
}
