import { useId } from 'react'

import type { DnsRecord } from '@/api/types'
import { StatusBadge } from '@/components/status-badge'
import { Field, FieldLabel } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'

export function RecordStatusToggle({ record, available, pending, onChange }: {
  record: Pick<DnsRecord, 'name' | 'type' | 'status'>
  available: boolean
  pending: boolean
  onChange: (enabled: boolean) => void
}) {
  const id = useId()
  if (!available || record.status === 'unknown') return <StatusBadge value={record.status} />
  const enabled = record.status === 'enabled'

  return (
    <Field orientation="horizontal" data-disabled={pending}>
      <Switch
        id={id}
        size="sm"
        checked={enabled}
        disabled={pending}
        aria-label={`${enabled ? '停用' : '启用'} ${record.name} ${record.type} 记录`}
        onCheckedChange={onChange}
      />
      <FieldLabel htmlFor={id}>{enabled ? '启用' : '停用'}</FieldLabel>
    </Field>
  )
}
