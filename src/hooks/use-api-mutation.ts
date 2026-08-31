import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'

import { errorMessage } from '@/api/client'
import { toast } from '@/components/ui/toast'

export function useApiMutation<TVariables, TResult = unknown>(options: {
  mutationFn: (variables: TVariables) => Promise<TResult>
  successMessage: string | ((result: TResult, variables: TVariables) => string)
  invalidate?: QueryKey[]
  onSuccess?: (result: TResult, variables: TVariables) => void | Promise<void>
}) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: options.mutationFn,
    onSuccess: async (result, variables) => {
      toast.add({
        title: typeof options.successMessage === 'function' ? options.successMessage(result, variables) : options.successMessage,
        type: 'success',
      })
      await Promise.all((options.invalidate ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })))
      await options.onSuccess?.(result, variables)
    },
    onError: (error) => toast.add({ title: '操作失败', description: errorMessage(error), type: 'error' }),
  })
}
