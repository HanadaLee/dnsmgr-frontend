import type { RecordGroup, RecordOptions } from '@/api/types'
import { ConfirmAction } from '@/components/confirm-action'
import { FormDialog, type FormFieldSpec } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { buildRecordBatchBody } from '@/lib/record-batch'

export function RecordBatchToolbar({ snapshots, options, groups, pending, onBatch }: {
  snapshots: Record<string, unknown>[]
  options?: RecordOptions
  groups: RecordGroup[]
  pending: boolean
  onBatch: (body: Record<string, unknown>, close?: () => void) => void
}) {
  const forms: Array<{ action: string; label: string; fields: FormFieldSpec[] }> = [
    ...(options?.capabilities.recordRemark === 'separate' ? [{
      action: 'remark', label: '修改备注',
      fields: [{ name: 'remark', label: '备注', kind: 'textarea' as const }],
    }] : []),
    ...(options?.capabilities.recordGroups ? [{
      action: 'group', label: '移动分组',
      fields: [{ name: 'groupId', label: '分组', kind: 'select' as const, options: groups.map((group) => ({ value: `group:${encodeURIComponent(group.id)}`, label: group.name })), required: true }],
    }] : []),
    {
      action: 'value', label: '修改记录值',
      fields: [
        { name: 'type', label: '记录类型', kind: 'select', options: (options?.recordTypes ?? []).map((value) => ({ value, label: value })), required: true },
        { name: 'value', label: '记录值', kind: 'textarea', required: true },
      ],
    },
    {
      action: 'line', label: '修改线路',
      fields: [{ name: 'lineId', label: '线路', kind: 'select', options: (options?.lines ?? []).map((line) => ({ value: line.id, label: line.label })), required: true }],
    },
  ]

  return (
    <div role="group" aria-label="解析记录批量操作" className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
      <span className="mr-auto whitespace-nowrap text-sm">已选择 {snapshots.length} 条记录</span>
      {options?.capabilities.recordStatus ? <>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onBatch(buildRecordBatchBody({ action: 'status-enable' }, snapshots))}>启用</Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onBatch(buildRecordBatchBody({ action: 'status-disable' }, snapshots))}>停用</Button>
      </> : null}
      {forms.map(({ action, label, fields }) => (
        <FormDialog
          key={action}
          trigger={<Button type="button" size="sm" variant="outline" disabled={pending}>{label}</Button>}
          title={`批量${label}`}
          description={`将修改所选的 ${snapshots.length} 条记录。`}
          fields={fields}
          pending={pending}
          onSubmit={(values, close) => onBatch(buildRecordBatchBody({ ...values, action }, snapshots, options?.providerType), close)}
        />
      ))}
      <ConfirmAction
        trigger={<Button type="button" size="sm" variant="destructive" disabled={pending}>删除</Button>}
        title="删除所选解析记录？"
        description={`所选的 ${snapshots.length} 条记录将被永久删除。`}
        destructive
        pending={pending}
        onConfirm={() => onBatch(buildRecordBatchBody({ action: 'delete' }, snapshots))}
      />
    </div>
  )
}
