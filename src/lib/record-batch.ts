import { recordValueForSave } from '@/lib/dns-record-value'

export function buildRecordBatchBody<T extends object>(
  values: Record<string, unknown>,
  snapshots: T[],
  providerType?: string,
) {
  const action = String(values.action ?? '')
  if (action.startsWith('status-')) {
    return { action: 'status', enabled: action === 'status-enable', records: snapshots }
  }

  if (action === 'delete') return { action, records: snapshots }
  if (action === 'remark') return { action, remark: String(values.remark ?? '') || null, records: snapshots }
  if (action === 'group') return { action, groupId: groupIdFromSelect(values.groupId), records: snapshots }
  if (action === 'value') {
    const type = String(values.type ?? '')
    return { action, type, value: recordValueForSave(providerType, type, String(values.value ?? '')), records: snapshots }
  }
  return { action, lineId: values.lineId, records: snapshots }
}

function groupIdFromSelect(value: unknown) {
  const text = String(value ?? '')
  return text.startsWith('group:') ? decodeURIComponent(text.slice('group:'.length)) : text
}
