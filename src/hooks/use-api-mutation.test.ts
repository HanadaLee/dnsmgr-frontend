import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(async () => undefined),
  toastPromise: vi.fn((promise: Promise<unknown>, _options: unknown) => promise),
  useMutation: vi.fn((options: unknown) => options),
}))

vi.mock('@tanstack/react-query', () => ({
  useMutation: mocks.useMutation,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))

vi.mock('@/components/ui/toast', () => ({
  toast: { promise: mocks.toastPromise },
}))

import { useApiMutation } from '@/hooks/use-api-mutation'

type CapturedMutation<TVariables, TResult> = {
  mutationFn: (variables: TVariables) => Promise<TResult>
  onSuccess: (result: TResult, variables: TVariables) => Promise<void>
}

type PromiseToastOptions<TResult> = {
  loading: { title: string; description: string }
  success: (result: TResult) => { title: string; description: undefined }
  error: (error: unknown) => { title: string; description: string }
}

describe('useApiMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows one promise toast from submission through completion', async () => {
    const request = vi.fn(async (id: number) => ({ id, message: 'done' }))
    const mutation = useApiMutation({
      mutationFn: request,
      pendingMessage: (id) => `正在处理任务 #${id}`,
      successMessage: (result) => result.message,
    }) as unknown as CapturedMutation<number, { id: number; message: string }>

    const result = await mutation.mutationFn(42)

    expect(request).toHaveBeenCalledWith(42)
    expect(result).toEqual({ id: 42, message: 'done' })
    expect(mocks.toastPromise).toHaveBeenCalledTimes(1)

    const toastOptions = mocks.toastPromise.mock.calls[0][1] as PromiseToastOptions<typeof result>
    expect(toastOptions.loading).toEqual({
      title: '正在处理任务 #42',
      description: '请求已提交，请稍候，不要重复操作。',
    })
    expect(toastOptions.success(result)).toEqual({ title: 'done', description: undefined })
    expect(toastOptions.error(new Error('failed'))).toEqual({ title: '操作失败', description: 'failed' })
  })

  it('uses generic pending feedback and keeps invalidation callbacks', async () => {
    const afterSuccess = vi.fn(async () => undefined)
    const mutation = useApiMutation({
      mutationFn: async () => 'saved',
      successMessage: '保存成功',
      invalidate: [['items'], ['dashboard']],
      onSuccess: afterSuccess,
    }) as unknown as CapturedMutation<void, string>

    const result = await mutation.mutationFn()
    const toastOptions = mocks.toastPromise.mock.calls[0][1] as PromiseToastOptions<string>
    expect(toastOptions.loading.title).toBe('正在处理操作')
    expect(toastOptions.success(result).title).toBe('保存成功')

    await mutation.onSuccess(result, undefined)
    expect(mocks.invalidateQueries).toHaveBeenNthCalledWith(1, { queryKey: ['items'] })
    expect(mocks.invalidateQueries).toHaveBeenNthCalledWith(2, { queryKey: ['dashboard'] })
    expect(afterSuccess).toHaveBeenCalledWith('saved', undefined)
  })
})
