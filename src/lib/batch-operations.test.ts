import { describe, expect, it } from 'vitest'
import type { DomainSummary, RecordOptions } from '@/api/types'
import {
  applyRecordChanges,
  batchTaskFromQuery,
  deleteRecordPlan,
  domainNamesFromText,
  draftFromRecord,
  recordDraftChanged,
  recordPlan,
  recordUpdatePlans,
  resolveDomainScope,
  selectedDomains,
} from '@/lib/batch-operations'
import type { GlobalRecord } from '@/lib/record-search'

export const testDomain: DomainSummary = {
  id: 12,
  name: 'example.com',
  provider: { type: 'dnspod', label: 'DNSPod', accountId: 7, accountLabel: '主账户' },
  recordCount: 2,
  expiryLookup: 'unknown',
  noticeEnabled: false,
  hidden: false,
  ssoEnabled: false,
  categoryId: 3,
  category: '生产',
}
export const testOptions: RecordOptions = {
  providerType: 'dnspod',
  minTtl: 60,
  lines: [
    { id: '0', label: '默认' },
    { id: '1', label: '电信' },
  ],
  recordTypes: ['A', 'AAAA', 'CNAME', 'MX', 'TXT'],
  capabilities: {
    recordRemark: 'inline',
    recordStatus: true,
    redirectRecords: false,
    recordLogs: false,
    recordWeight: true,
    clientPaging: true,
    recordSorting: false,
    recordGroups: false,
    weightedSets: false,
    domainAliases: false,
    customHostnames: false,
    hierarchicalRecords: false,
  },
}
export function testRecord(id = 'a', value = '192.0.2.1'): GlobalRecord {
  return {
    id,
    key: `12:${id}`,
    name: 'www',
    type: 'A',
    value,
    line: { id: '1', label: '电信' },
    ttl: 1200,
    mxPriority: 0,
    weight: 0,
    remark: '原备注',
    status: 'enabled',
    domainId: 12,
    domainName: 'example.com',
    provider: 'DNSPod',
    providerType: 'dnspod',
  }
}

describe('per-record batch plans', () => {
  it('sends separate values and preserves every untouched field including zero values', () => {
    const first = testRecord('a'),
      second = testRecord('b')
    const plans = [
      recordPlan(testDomain, { ...draftFromRecord(first), value: '198.51.100.1' }, testOptions, first),
      recordPlan(testDomain, { ...draftFromRecord(second), value: '198.51.100.2' }, testOptions, second),
    ]
    expect(plans.map((plan) => plan.body?.value)).toEqual(['198.51.100.1', '198.51.100.2'])
    for (const plan of plans) {
      expect(plan.issues).toEqual([])
      expect(plan.body).toMatchObject({
        name: 'www',
        type: 'A',
        lineId: '1',
        ttl: 1200,
        mxPriority: 0,
        weight: 0,
        remark: '原备注',
        current: { value: '192.0.2.1', ttl: 1200 },
      })
    }
    expect(plans[0].key).toBe('12:a')
    expect(plans[0].path).toBe('/api/web/v1/domains/12/records/a')
  })

  it('only changes enabled common fields and uses literal replacement, not regex', () => {
    const draft = { ...draftFromRecord(testRecord()), value: 'a.edge.example.net,b.edge.example.net' }
    const next = applyRecordChanges(draft, { ttl: '600' }, { find: '.edge.', value: '.new.' })
    expect(next.value).toBe('a.new.example.net,b.new.example.net')
    expect(next.line).toBe('1')
    expect(applyRecordChanges(draft, {}).value).toBe(draft.value)
    expect(recordDraftChanged(testRecord(), draftFromRecord(testRecord()))).toBe(false)
    expect(recordDraftChanged(testRecord(), { ...draftFromRecord(testRecord()), mxPriority: '1' })).toBe(true)
  })

  it('validates provider options and never falls back from an unknown explicit line', () => {
    const current = testRecord()
    const plan = recordPlan(
      testDomain,
      { ...draftFromRecord(current), type: 'CAA', line: '不存在', ttl: '30', mxPriority: '-1', weight: '101' },
      testOptions,
      current,
    )
    expect(plan.issues.join(' ')).toMatch(/不支持 CAA/)
    expect(plan.issues.join(' ')).toMatch(/无法匹配线路/)
    expect(plan.issues).toHaveLength(5)
  })

  it('retains multi-value snapshots, QingCloud parent and weighted mode on update', () => {
    const current = {
      ...testRecord(),
      providerType: 'qingcloud',
      values: ['192.0.2.1', '198.51.100.2'],
      mode: 3,
      parentId: 'parent',
      weight: 50,
    }
    const options = { ...testOptions, capabilities: { ...testOptions.capabilities, hierarchicalRecords: true } }
    const plan = recordPlan(
      { ...testDomain, provider: { ...testDomain.provider, type: 'qingcloud' } },
      { ...draftFromRecord(current), value: '203.0.113.1' },
      options,
      current,
    )
    expect(plan.body).toMatchObject({
      mode: 3,
      parentId: 'parent',
      weight: 50,
      current: { values: ['192.0.2.1', '198.51.100.2'], parentId: 'parent', mode: 3 },
    })
    expect(
      recordPlan(testDomain, { ...draftFromRecord(current), weight: '0' }, options, current).issues.join(' '),
    ).toContain('1–99')
  })

  it('normalizes Huawei CNAME display and save without changing TXT punctuation', () => {
    const domain = { ...testDomain, provider: { ...testDomain.provider, type: 'huawei' } }
    const current = { ...testRecord(), providerType: 'huawei', type: 'CNAME', value: 'old.example.net.' }
    expect(recordDraftChanged(current, draftFromRecord(current))).toBe(false)
    expect(
      recordPlan(domain, { ...draftFromRecord(current), value: 'new.example.net' }, testOptions, current).body?.value,
    ).toBe('new.example.net.')
    expect(
      recordPlan(domain, { ...draftFromRecord(current), type: 'TXT', value: 'v=example.' }, testOptions, current).body
        ?.value,
    ).toBe('v=example.')
  })

  it('uses the dedicated remark endpoint for providers with separate remarks', () => {
    const current = testRecord()
    const options = { ...testOptions, capabilities: { ...testOptions.capabilities, recordRemark: 'separate' as const } }
    const draft = { ...draftFromRecord(current), remark: '新的备注' }
    const onlyRemark = recordUpdatePlans(testDomain, draft, options, current)
    expect(onlyRemark).toHaveLength(1)
    expect(onlyRemark[0]).toMatchObject({
      path: '/api/web/v1/domains/12/records/a/remark',
      body: { remark: '新的备注' },
      dependsOn: undefined,
    })
    const both = recordUpdatePlans(testDomain, { ...draft, value: '198.51.100.1' }, options, current)
    expect(both).toHaveLength(2)
    expect(both[0].body).toMatchObject({ value: '198.51.100.1', remark: '原备注' })
    expect(both[1].dependsOn).toBe(both[0].key)
    expect(recordPlan(testDomain, draft, options).issues.join(' ')).toContain('创建后')
    expect(recordUpdatePlans(testDomain, draftFromRecord(current), options, current)).toEqual([])
  })

  it('keeps Cloudflare disabled records paused when editing values or names', () => {
    const domain = { ...testDomain, provider: { ...testDomain.provider, type: 'cloudflare' } }
    const current = { ...testRecord(), providerType: 'cloudflare', status: 'disabled' as const }
    expect(
      recordPlan(domain, { ...draftFromRecord(current), value: '198.51.100.1' }, testOptions, current).body?.name,
    ).toBe('www_pause')
    expect(recordPlan(domain, { ...draftFromRecord(current), name: '@' }, testOptions, current).body?.name).toBe(
      '__root___pause',
    )
    expect(recordPlan(domain, { ...draftFromRecord(current), name: 'api' }, testOptions, current).body?.name).toBe(
      'api_pause',
    )
  })

  it('deletes the exact record using its snapshot and no stray fields', () => {
    const record = testRecord('id/with slash')
    const plan = deleteRecordPlan(record)
    expect(plan.path).toContain('id%2Fwith%20slash')
    expect(Object.keys(plan.body!)).toEqual(['current'])
    expect(plan.body?.current).toMatchObject({ id: record.id, value: record.value })
  })
})

describe('explicit domain scope', () => {
  it('normalizes and deduplicates names, without matching arbitrary suffixes', () => {
    expect(domainNamesFromText('EXAMPLE.COM.\nexample.com,sub.example.com')).toEqual(['example.com', 'sub.example.com'])
    expect(resolveDomainScope('unknown.example.com', [testDomain]).errors).toHaveLength(1)
  })
  it('requires explicit DNS-account resolution for duplicate names', () => {
    const domains = [testDomain, { ...testDomain, id: 13 }]
    expect(resolveDomainScope('example.com', domains).errors).toHaveLength(1)
    expect(resolveDomainScope('example.com', domains, [13]).domains.map((domain) => domain.id)).toEqual([13])
    expect(resolveDomainScope('example.com', domains, [99]).errors).toHaveLength(1)
  })
  it('supports groups and maps old links to new tasks', () => {
    expect(selectedDomains({ mode: 'group', text: '', group: '3' }, [testDomain]).domains).toHaveLength(1)
    expect(selectedDomains({ mode: 'group', text: '', group: '' }, [testDomain]).errors).toHaveLength(1)
    expect(batchTaskFromQuery('batch-edit')).toBe('modify-record')
    expect(batchTaskFromQuery('smart')).toBe('import-record')
    expect(batchTaskFromQuery('search')).toBe('query-record')
    expect(batchTaskFromQuery(null)).toBe('query-record')
  })
})
