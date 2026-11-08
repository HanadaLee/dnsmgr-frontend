import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiGet } from '@/api/client'
import type { DnsRecord, DomainSummary, PageResponse } from '@/api/types'
import { searchDomainRecords } from '@/lib/record-search'

vi.mock('@/api/client', () => ({ apiGet: vi.fn() }))

const get = vi.mocked(apiGet)

function domain(providerType = 'dnspod'): DomainSummary {
  return {
    id: 12,
    name: 'example.com',
    provider: { type: providerType, label: providerType },
    recordCount: 0,
    expiryLookup: 'unknown',
    noticeEnabled: false,
    hidden: false,
    ssoEnabled: false,
  }
}

function record(id: string, value: string, extra: Partial<DnsRecord> = {}): DnsRecord {
  return { id, name: 'www', type: 'A', value, line: { id: '0', label: '默认' }, status: 'enabled', ...extra }
}

function page(data: DnsRecord[], total = data.length, number = 1): PageResponse<DnsRecord> {
  return { code: 'OK', data, meta: { page: number, pageSize: 100, total } }
}

beforeEach(() => { get.mockReset() })

describe('global record value search', () => {
  it('loads all pages without a provider value filter for contains matching', async () => {
    get.mockResolvedValueOnce(page([record('1', '198.51.100.1')], 2))
      .mockResolvedValueOnce(page([record('2', '192.0.2.10')], 2, 2))

    const results = await searchDomainRecords(domain(), '192.0.2', 'contains')

    expect(get).toHaveBeenNthCalledWith(1, '/api/web/v1/domains/12/records', { page: 1, pageSize: 100 })
    expect(get).toHaveBeenNthCalledWith(2, '/api/web/v1/domains/12/records', { page: 2, pageSize: 100 })
    expect(results).toEqual([expect.objectContaining({ id: '2', key: '12:2', domainId: 12, domainName: 'example.com', providerType: 'dnspod' })])
  })

  it('keeps the default exact filter and rejects partial provider results', async () => {
    get.mockResolvedValueOnce(page([record('1', '192.0.2.1'), record('2', '192.0.2.10')]))

    const results = await searchDomainRecords(domain(), ' 192.0.2.1 ')

    expect(get).toHaveBeenCalledExactlyOnceWith('/api/web/v1/domains/12/records', { value: '192.0.2.1', page: 1, pageSize: 100 })
    expect(results.map((item) => item.id)).toEqual(['1'])
  })

  it('matches individual values in multi-value records', async () => {
    get.mockResolvedValueOnce(page([record('1', '192.0.2.1,198.51.100.2', { values: ['192.0.2.1', '198.51.100.2'] })]))
    expect((await searchDomainRecords(domain(), '51.100', 'contains')).map((item) => item.id)).toEqual(['1'])
  })

  it.each(['huawei', 'dnspod'])('preserves trailing-dot normalization for %s CNAME records', async (providerType) => {
    get.mockResolvedValueOnce(page([record('1', 'edge.example.net.', { type: 'CNAME', values: ['edge.example.net.'] })]))
    expect((await searchDomainRecords(domain(providerType), 'edge.example.net', 'exact')).map((item) => item.id)).toEqual(['1'])
  })

  it('does not send a provider value filter for Huawei exact matching', async () => {
    get.mockResolvedValueOnce(page([record('1', '192.0.2.1')]))
    await searchDomainRecords(domain('huawei'), '192.0.2.1')
    expect(get).toHaveBeenCalledExactlyOnceWith('/api/web/v1/domains/12/records', { page: 1, pageSize: 100 })
  })

  it.each(['huawei', 'dnspod'])('keeps literal dots in %s contains queries', async (providerType) => {
    get.mockResolvedValueOnce(page([
      record('1', 'edge.example.net.', { type: 'CNAME' }),
      record('2', 'edge-other.example.net.', { type: 'CNAME' }),
    ]))
    expect((await searchDomainRecords(domain(providerType), 'edge.', 'contains')).map((item) => item.id)).toEqual(['1'])
  })

  it.each(['exact', 'contains'] as const)('loads QingCloud parent and child pages for %s matching', async (mode) => {
    get.mockResolvedValueOnce(page([record('parent1', '192.0.2.1')], 2))
      .mockResolvedValueOnce(page([record('parent2', '192.0.2.1')], 2, 2))
      .mockResolvedValueOnce(page([record('child1', '198.51.100.1', { parentId: 'parent1' })], 2))
      .mockResolvedValueOnce(page([record('child2', '192.0.2.1', { parentId: 'parent1' })], 2, 2))
      .mockResolvedValueOnce(page([]))

    expect((await searchDomainRecords(domain('qingcloud'), mode === 'exact' ? '192.0.2.1' : '192.0.2', mode)).map((item) => item.id)).toEqual(['child2'])
    expect(get).toHaveBeenNthCalledWith(3, '/api/web/v1/domains/12/records', { subdomain: 'parent1', page: 1, pageSize: 100 })
    expect(get).toHaveBeenNthCalledWith(4, '/api/web/v1/domains/12/records', { subdomain: 'parent1', page: 2, pageSize: 100 })
    expect(get).toHaveBeenNthCalledWith(5, '/api/web/v1/domains/12/records', { subdomain: 'parent2', page: 1, pageSize: 100 })
  })

  it('stops pagination when the provider returns an empty page', async () => {
    get.mockResolvedValueOnce(page([], 100))
    expect(await searchDomainRecords(domain(), 'example', 'contains')).toEqual([])
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('does not query any domains for an empty keyword', async () => {
    expect(await searchDomainRecords(domain(), '   ', 'contains')).toEqual([])
    expect(get).not.toHaveBeenCalled()
  })

  it('propagates request failures so the page can report incomplete searches', async () => {
    get.mockRejectedValueOnce(new Error('provider unavailable'))
    await expect(searchDomainRecords(domain(), 'example', 'contains')).rejects.toThrow('provider unavailable')
  })
})
