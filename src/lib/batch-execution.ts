import { ApiClientError, apiRequest } from '@/api/client'
import { BATCH_LIMIT, type BatchPlan } from '@/lib/batch-operations'

export type BatchState = 'pending' | 'running' | 'success' | 'failed' | 'unknown' | 'skipped'
export type BatchResult = { plan: BatchPlan; state: BatchState; message?: string }
export const BATCH_STATE_LABELS: Record<BatchState, string> = {
  pending: '待执行',
  running: '执行中',
  success: '成功',
  failed: '失败',
  unknown: '结果待核对',
  skipped: '未执行',
}

export async function executeBatch(
  plans: BatchPlan[],
  onProgress: (results: BatchResult[]) => void,
  shouldStop: () => boolean = () => false,
  previouslySucceeded: ReadonlySet<string> = new Set(),
): Promise<BatchResult[]> {
  if (!plans.length || plans.some((plan) => plan.issues.length)) throw new Error('请先修正所有预览错误')
  if (plans.length > BATCH_LIMIT) throw new Error(`单次最多执行 ${BATCH_LIMIT} 项`)
  if (new Set(plans.map((plan) => plan.key)).size !== plans.length) throw new Error('执行计划包含重复项目')
  const results: BatchResult[] = plans.map((plan) => ({ plan, state: 'pending' }))
  const publish = () => onProgress(results.map((result) => ({ ...result })))
  let sessionExpired = false
  const succeeded = new Set(previouslySucceeded)
  for (let index = 0; index < plans.length; index += 1) {
    if (shouldStop() || sessionExpired) {
      for (let rest = index; rest < results.length; rest += 1)
        results[rest] = {
          ...results[rest],
          state: 'skipped',
          message: sessionExpired ? '登录状态已过期；未发送请求' : '用户停止；未发送请求',
        }
      break
    }
    const plan = plans[index]
    if (plan.dependsOn && !succeeded.has(plan.dependsOn)) {
      results[index] = { plan, state: 'skipped', message: '前置记录修改未成功；未发送请求，请先完成前置项' }
      publish()
      continue
    }
    results[index] = { plan, state: 'running' }
    publish()
    try {
      await apiRequest(plan.method, plan.path, { body: plan.body })
      results[index] = { plan, state: 'success' }
      succeeded.add(plan.key)
    } catch (error) {
      const unknown =
        !(error instanceof ApiClientError) || error.status === 0 || error.status === 408 || error.status >= 500
      sessionExpired = error instanceof ApiClientError && error.status === 401
      results[index] = {
        plan,
        state: unknown ? 'unknown' : 'failed',
        message: error instanceof Error ? error.message : '未知错误',
      }
    }
    publish()
  }
  publish()
  return results
}
