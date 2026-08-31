import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'

import { errorMessage } from '@/api/client'
import { toast } from '@/components/ui/toast'

export function useApiMutation<TVariables, TResult = unknown>(options: {
  mutationFn: (variables: TVariables) => Promise<TResult>
  successMessage: string | ((result: TResult, variables: TVariables) => string)
  pendingMessage?: string | ((variables: TVariables) => string)
  invalidate?: QueryKey[]
  onSuccess?: (result: TResult, variables: TVariables) => void | Promise<void>
}) {
  const queryClient = useQueryClient()

  const successMessage = (result: TResult, variables: TVariables) =>
    typeof options.successMessage === 'function'
      ? options.successMessage(result, variables)
      : options.successMessage

  return useMutation({
    mutationFn: (variables: TVariables) => {
      const pendingMessage = typeof options.pendingMessage === 'function'
        ? options.pendingMessage(variables)
        : options.pendingMessage ?? '正在处理操作'

      return toast.promise(
        Promise.resolve().then(() => options.mutationFn(variables)),
        {
          loading: {
            title: pendingMessage,
            description: '请求已提交，请稍候，不要重复操作。',
          },
          success: (result) => ({
            title: successMessage(result, variables),
            description: undefined,
          }),
          error: (error) => ({
            title: '操作失败',
            description: errorMessage(error),
          }),
        },
      )
    },
    onSuccess: async (result, variables) => {
      await Promise.all((options.invalidate ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })))
      await options.onSuccess?.(result, variables)
    },
  })
}
