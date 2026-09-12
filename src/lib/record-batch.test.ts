import { describe, expect, it } from 'vitest'

import { buildRecordBatchBody } from '@/lib/record-batch'

const snapshots = [{ id: 'r1', name: 'www', type: 'A', value: '192.0.2.1' }]

describe('record batch payloads', () => {
  it('does not send remark for delete operations', () => {
    expect(buildRecordBatchBody({ action: 'delete', remark: null }, snapshots)).toEqual({
      action: 'delete',
      records: snapshots,
    })
  })

  it('keeps remark only for the remark operation', () => {
    expect(buildRecordBatchBody({ action: 'remark', remark: 'migration' }, snapshots)).toEqual({
      action: 'remark',
      remark: 'migration',
      records: snapshots,
    })
  })
})
