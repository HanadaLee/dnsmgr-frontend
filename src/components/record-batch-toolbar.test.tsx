import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RecordOptions } from '@/api/types'

const captured = vi.hoisted(() => ({
  buttons: new Map<string, { disabled?: boolean; onClick?: () => void }>(),
  forms: new Map<string, {
    fields: Array<{ name: string }>
    onSubmit: (values: Record<string, unknown>, close: () => void) => void
  }>(),
  confirm: undefined as (() => void) | undefined,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) => {
    captured.buttons.set(String(children), { disabled, onClick })
    return <button disabled={disabled}>{children}</button>
  },
}))

vi.mock('@/components/form-dialog', () => ({
  FormDialog: ({ trigger, title, fields, onSubmit }: {
    trigger: ReactNode
    title: string
    fields: Array<{ name: string }>
    onSubmit: (values: Record<string, unknown>, close: () => void) => void
  }) => {
    captured.forms.set(title, { fields, onSubmit })
    return trigger
  },
}))

vi.mock('@/components/confirm-action', () => ({
  ConfirmAction: ({ trigger, onConfirm }: { trigger: ReactNode; onConfirm: () => void }) => {
    captured.confirm = onConfirm
    return trigger
  },
}))

import { RecordBatchToolbar } from '@/components/record-batch-toolbar'

const snapshots = [{ id: 'r1', name: 'www', type: 'A', value: '192.0.2.1', lineId: '0', ttl: 600 }]
const options: RecordOptions = {
  providerType: 'huawei',
  minTtl: 1,
  recordTypes: ['A', 'CNAME'],
  lines: [{ id: '0', label: '默认' }],
  capabilities: {
    recordRemark: 'separate', recordStatus: true, recordGroups: true,
    redirectRecords: false, recordLogs: false, recordWeight: false, clientPaging: false,
    recordSorting: false, weightedSets: false, domainAliases: false,
    customHostnames: false, hierarchicalRecords: false,
  },
}

function render(pending = false, recordOptions = options) {
  const onBatch = vi.fn()
  const markup = renderToStaticMarkup(<RecordBatchToolbar snapshots={snapshots} options={recordOptions} groups={[{ id: '', name: '默认分组' }]} pending={pending} onBatch={onBatch} />)
  return { onBatch, markup }
}

describe('record batch toolbar', () => {
  beforeEach(() => {
    captured.buttons.clear()
    captured.forms.clear()
    captured.confirm = undefined
  })

  it('shows flat action buttons without an operation selector', () => {
    const { markup, onBatch } = render()
    expect([...captured.buttons.keys()]).toEqual(['启用', '停用', '修改备注', '移动分组', '修改记录值', '修改线路', '删除'])
    expect(markup).not.toContain('<select')
    for (const form of captured.forms.values()) expect(form.fields.some((field) => field.name === 'action')).toBe(false)
    expect(onBatch).not.toHaveBeenCalled()
  })

  it.each([['启用', true], ['停用', false]] as const)('executes %s directly with the selected record snapshots', (label, enabled) => {
    const { onBatch } = render()
    captured.buttons.get(label)?.onClick?.()
    expect(onBatch).toHaveBeenCalledExactlyOnceWith({ action: 'status', enabled, records: snapshots })
  })

  it('requires confirmation before submitting deletion', () => {
    const { onBatch } = render()
    expect(captured.buttons.get('删除')?.onClick).toBeUndefined()
    expect(onBatch).not.toHaveBeenCalled()
    captured.confirm?.()
    expect(onBatch).toHaveBeenCalledExactlyOnceWith({ action: 'delete', records: snapshots })
  })

  it.each([
    ['修改备注', { remark: '' }, { action: 'remark', remark: null }],
    ['移动分组', { groupId: 'group:' }, { action: 'group', groupId: '' }],
    ['修改记录值', { type: 'CNAME', value: 'target.example.com' }, { action: 'value', type: 'CNAME', value: 'target.example.com.' }],
    ['修改线路', { lineId: '0' }, { action: 'line', lineId: '0' }],
  ] as const)('opens only the %s form and preserves payload normalization', (label, values, expected) => {
    const { onBatch } = render()
    const close = vi.fn()
    captured.forms.get(`批量${label}`)?.onSubmit(values, close)
    expect(onBatch).toHaveBeenCalledExactlyOnceWith({ ...expected, records: snapshots }, close)
  })

  it('disables every action while an operation is pending', () => {
    render(true)
    expect(captured.buttons.size).toBe(7)
    for (const button of captured.buttons.values()) expect(button.disabled).toBe(true)
  })

  it('hides provider-unsupported actions', () => {
    render(false, { ...options, capabilities: { ...options.capabilities, recordStatus: false, recordRemark: 'none', recordGroups: false } })
    expect([...captured.buttons.keys()]).toEqual(['修改记录值', '修改线路', '删除'])
  })
})
