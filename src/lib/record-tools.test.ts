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

  it('keeps exact matching as the default and falls back from empty provider values', () => {
    expect(recordMatchesValue({ value: '192.0.2.1' }, '192.0.2')).toBe(false)
    expect(recordMatchesValue({ value: '192.0.2.1', values: [] }, '192.0.2.1')).toBe(true)
    expect(recordMatchesValue({ value: 'Target.example.net' }, 'target.example.net')).toBe(false)
  })

  it('matches literal IP, domain, IPv6 and TXT fragments without case sensitivity', () => {
    expect(recordMatchesValue({ value: '192.0.2.1' }, '192.0.2', 'contains')).toBe(true)
    expect(recordMatchesValue({ value: 'Edge.Example.NET' }, 'example.net', 'contains')).toBe(true)
    expect(recordMatchesValue({ value: '2001:DB8::1' }, 'db8:', 'contains')).toBe(true)
    expect(recordMatchesValue({ value: 'verification=TokenValue' }, 'TOKEN', 'contains')).toBe(true)
    expect(recordMatchesValue({ value: '192.0.2.1' }, '192.*', 'contains')).toBe(false)
    expect(recordMatchesValue({ value: 'prefix[a-z]+suffix' }, '[a-z]+', 'contains')).toBe(true)
    expect(recordMatchesValue({ value: 'prefix-abc-suffix' }, '[a-z]+', 'contains')).toBe(false)
  })

  it('checks individual values without matching across their display separator', () => {
    const record = { value: '192.0.2.1,198.51.100.2', values: ['192.0.2.1', '198.51.100.2'] }
    expect(recordMatchesValue(record, '51.100', 'contains')).toBe(true)
    expect(recordMatchesValue(record, '2.1,198', 'contains')).toBe(false)
    expect(recordMatchesValue({ value: '192.0.2.1', values: [] }, '192.0.2', 'contains')).toBe(true)
  })

  it.each(['exact', 'contains'] as const)('does not match empty keywords in %s mode', (mode) => {
    expect(recordMatchesValue({ value: '192.0.2.1' }, '', mode)).toBe(false)
    expect(recordMatchesValue({ value: '' }, '', mode)).toBe(false)
  })
})
