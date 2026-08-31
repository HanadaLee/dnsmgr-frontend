import { describe, expect, it } from 'vitest'

import type { DomainSummary } from '@/api/types'
import {
  hostForManagedDomain,
  inferRecordType,
  managedDomainCandidates,
  recordMatchesValue,
} from '@/lib/record-tools'

function domain(id: number, name: string, accountLabel: string): DomainSummary {
  return {
    id,
    name,
    provider: { type: 'dnspod', label: 'DNSPod', accountLabel },
    recordCount: 0,
    expiryLookup: 'unknown',
    noticeEnabled: false,
    hidden: false,
    ssoEnabled: false,
  }
}

describe('record tools', () => {
  it('keeps every account that manages the most specific matching domain', () => {
    const candidates = managedDomainCandidates('www.example.com', [
      domain(1, 'com', 'root'),
      domain(2, 'example.com', 'primary'),
      domain(3, 'example.com', 'secondary'),
    ])
    expect(candidates.map((item) => item.id)).toEqual([2, 3])
    expect(hostForManagedDomain('www.example.com', candidates[0])).toBe('www')
  })

  it('matches each provider value and preserves the legacy type inference rules', () => {
    expect(recordMatchesValue({ value: 'mx1.example.net,mx2.example.net', values: ['mx1.example.net', 'mx2.example.net'] }, 'mx2.example.net')).toBe(true)
    expect(recordMatchesValue({ value: '192.0.2.1' }, '192.0.2.1')).toBe(true)
    expect(inferRecordType('10')).toBe('MX')
    expect(inferRecordType('2001:db8::1')).toBe('AAAA')
  })
})
