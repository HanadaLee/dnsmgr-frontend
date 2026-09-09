import { describe, expect, it } from 'vitest'

import {
  bulkRecordTextForSave,
  recordValueForDisplay,
  recordValueForSave,
  recordValuesForSave,
} from '@/lib/dns-record-value'

describe('Huawei CNAME value compatibility', () => {
  it('hides one provider trailing dot for display', () => {
    expect(recordValueForDisplay('huawei', 'CNAME', 'target.example.com.')).toBe('target.example.com')
    expect(recordValueForDisplay('huawei', 'CNAME', 'one.example.com.,two.example.com.')).toBe('one.example.com,two.example.com')
    expect(recordValueForDisplay('huawei', 'A', '192.0.2.1')).toBe('192.0.2.1')
    expect(recordValueForDisplay('cloudflare', 'CNAME', 'target.example.com.')).toBe('target.example.com.')
  })

  it('adds the Huawei trailing dot exactly once on save', () => {
    expect(recordValueForSave('huawei', 'CNAME', 'target.example.com')).toBe('target.example.com.')
    expect(recordValueForSave('huawei', 'CNAME', 'target.example.com.')).toBe('target.example.com.')
    expect(recordValueForSave('huawei', 'CNAME', 'target.example.com. ')).toBe('target.example.com.')
    expect(recordValueForSave('huawei', 'CNAME', 'one.example.com,two.example.com.')).toBe('one.example.com.,two.example.com.')
    expect(recordValueForSave('cloudflare', 'CNAME', 'target.example.com')).toBe('target.example.com')
    expect(recordValuesForSave('huawei', 'CNAME', ['one.example.com', 'two.example.com.'])).toEqual(['one.example.com.', 'two.example.com.'])
  })

  it('normalizes explicit and automatically inferred Huawei bulk CNAME values', () => {
    expect(bulkRecordTextForSave('huawei', 'CNAME', 'www target.example.com\napi target.example.com.')).toBe('www target.example.com.\napi target.example.com.')
    expect(bulkRecordTextForSave('huawei', 'auto', 'www target.example.com\napi 192.0.2.1')).toBe('www target.example.com.\napi 192.0.2.1')
  })
})

describe('Tencent DNSPod domain value display compatibility', () => {
  it.each(['CNAME', 'NS', 'MX'])('hides one trailing dot from %s values', (recordType) => {
    expect(recordValueForDisplay('dnspod', recordType, 'target.example.com.')).toBe('target.example.com')
    expect(recordValueForDisplay('DNSPOD', recordType.toLowerCase(), 'one.example.com.,two.example.com.')).toBe('one.example.com,two.example.com')
  })

  it('does not alter unrelated record values or values sent back to DNSPod', () => {
    expect(recordValueForDisplay('dnspod', 'TXT', 'verification.')).toBe('verification.')
    expect(recordValueForDisplay('dnspod', 'A', '192.0.2.1')).toBe('192.0.2.1')
    expect(recordValueForSave('dnspod', 'CNAME', 'target.example.com')).toBe('target.example.com')
  })
})
