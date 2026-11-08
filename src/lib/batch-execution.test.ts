import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, apiRequest } from '@/api/client'
import type { BatchPlan } from '@/lib/batch-operations'
import { executeBatch } from '@/lib/batch-execution'

vi.mock('@/api/client', async (original) => ({ ...(await original<object>()), apiRequest: vi.fn() }))
const request = vi.mocked(apiRequest)
function plan(key: string, value = key): BatchPlan {
  return {
    key,
    domainId: 12,
    domainName: 'example.com',
    provider: 'DNSPod',
    name: 'www',
    action: 'modify-record',
    method: 'PATCH',
    path: `/records/${key}`,
    body: { value },
    issues: [],
  }
}
beforeEach(() => {
  request.mockReset()
})

describe('confirmed per-item execution', () => {
  it('sends each exact plan independently and reports progress', async () => {
    request.mockResolvedValue({ code: 'OK' })
    const progress = vi.fn()
    const results = await executeBatch([plan('one', '192.0.2.1'), plan('two', '198.51.100.2')], progress)
    expect(request).toHaveBeenNthCalledWith(1, 'PATCH', '/records/one', { body: { value: '192.0.2.1' } })
    expect(request).toHaveBeenNthCalledWith(2, 'PATCH', '/records/two', { body: { value: '198.51.100.2' } })
    expect(results.map((item) => item.state)).toEqual(['success', 'success'])
    expect(progress.mock.calls[0][0][0].state).toBe('running')
  })
  it('distinguishes rejection from uncertain network/server outcomes without retrying', async () => {
    request
      .mockResolvedValueOnce({ code: 'OK' })
      .mockRejectedValueOnce(new ApiClientError(400, 'INVALID', 'invalid line'))
      .mockRejectedValueOnce(new ApiClientError(0, 'NETWORK_ERROR', 'timeout'))
      .mockRejectedValueOnce(new ApiClientError(502, 'UPSTREAM', 'gateway'))
    const results = await executeBatch(
      ['one', 'two', 'three', 'four'].map((key) => plan(key)),
      () => {},
    )
    expect(results.map((item) => item.state)).toEqual(['success', 'failed', 'unknown', 'unknown'])
    expect(request).toHaveBeenCalledTimes(4)
  })
  it('only stops between requests and marks remaining items as never sent', async () => {
    let stopped = false
    request.mockImplementationOnce(async () => {
      stopped = true
      return { code: 'OK' }
    })
    const results = await executeBatch(
      [plan('one'), plan('two')],
      () => {},
      () => stopped,
    )
    expect(results.map((item) => item.state)).toEqual(['success', 'skipped'])
    expect(results[1].message).toContain('未发送请求')
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('rejects invalid or duplicate plans before any write', async () => {
    await expect(executeBatch([plan('one'), plan('one')], () => {})).rejects.toThrow('重复')
    await expect(executeBatch([{ ...plan('one'), issues: ['bad TTL'] }], () => {})).rejects.toThrow('修正')
    await expect(executeBatch([], () => {})).rejects.toThrow('修正')
    expect(request).not.toHaveBeenCalled()
  })
  it('stops sending further requests when the login session expires', async () => {
    request.mockRejectedValueOnce(new ApiClientError(401, 'UNAUTHORIZED', '登录过期'))
    const results = await executeBatch([plan('one'), plan('two')], () => {})
    expect(results.map((item) => item.state)).toEqual(['failed', 'skipped'])
    expect(results[1].message).toContain('登录状态已过期')
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('skips dependent remarks after a failed record update and permits an explicit continuation', async () => {
    request.mockRejectedValueOnce(new ApiClientError(400, 'INVALID', 'bad value'))
    const remark = { ...plan('remark'), dependsOn: 'one' }
    const results = await executeBatch([plan('one'), remark], () => {})
    expect(results.map((item) => item.state)).toEqual(['failed', 'skipped'])
    expect(request).toHaveBeenCalledTimes(1)
    request.mockResolvedValue({ code: 'OK' })
    expect(
      (
        await executeBatch(
          [remark],
          () => {},
          () => false,
          new Set(['one']),
        )
      )[0].state,
    ).toBe('success')
  })
})
