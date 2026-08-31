import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiClientError, apiGetAll, errorMessage } from '@/api/client'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('API client', () => {
  it('loads every page for complete select and batch-operation options', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://dns.test' } })
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input)
      const page = Number(url.searchParams.get('page'))
      expect(url.searchParams.get('pageSize')).toBe('100')
      return Response.json({
        code: 'OK',
        data: page === 1 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }],
        meta: { page, pageSize: 100, total: 3 },
      })
    })
    vi.stubGlobal('fetch', fetcher)

    await expect(apiGetAll<{ id: number }>('/api/web/v1/domains', { sort: 'name' }))
      .resolves.toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not expose implementation details in user-facing errors', () => {
    const error = new ApiClientError(502, 'LEGACY_UPSTREAM_FAILED', '原 dnsmgr 上游请求失败')
    expect(errorMessage(error)).toBe('服务暂时无法完成请求，请稍后重试或联系管理员')
  })
})
