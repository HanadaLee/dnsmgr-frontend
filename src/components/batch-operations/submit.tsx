import { useRef, useState } from 'react'
import { CheckIcon, PlayIcon, SquareIcon } from 'lucide-react'

import { BatchPagedTable } from '@/components/batch-operations/common'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { BATCH_LIMIT, type BatchPlan } from '@/lib/batch-operations'
import { BATCH_STATE_LABELS, executeBatch, type BatchResult } from '@/lib/batch-execution'

export type BatchComplete = (label: string, results: BatchResult[]) => void

export function BatchSubmit({
  label,
  prepare,
  disabled,
  busy = false,
  destructive = false,
  onBusyChange,
  onComplete,
}: {
  label: string
  prepare: () => Promise<BatchPlan[]> | BatchPlan[]
  disabled?: boolean
  busy?: boolean
  destructive?: boolean
  onBusyChange: (busy: boolean) => void
  onComplete: BatchComplete
}) {
  const [plans, setPlans] = useState<BatchPlan[]>([])
  const [results, setResults] = useState<BatchResult[]>([])
  const [open, setOpen] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [running, setRunning] = useState(false)
  const stop = useRef(false)
  const issues = plans.filter((plan) => plan.issues.length)

  async function preview() {
    if (busy || preparing || running) return
    setPreparing(true)
    onBusyChange(true)
    try {
      const next = await prepare()
      if (!next.length) throw new Error('没有可执行的变更；请先选择项目并填写需要修改的字段')
      if (next.length > BATCH_LIMIT) throw new Error(`单次最多执行 ${BATCH_LIMIT} 项，请缩小操作范围`)
      if (new Set(next.map((plan) => plan.key)).size !== next.length) throw new Error('预览中包含重复项目，请核对输入')
      setPlans(structuredClone(next))
      setOpen(true)
    } catch (error) {
      toast.add({
        title: '无法生成执行预览',
        description: error instanceof Error ? error.message : '请检查输入',
        type: 'error',
      })
    } finally {
      setPreparing(false)
      onBusyChange(false)
    }
  }

  async function run() {
    if (busy || preparing || running) return
    const frozen = structuredClone(plans)
    if (frozen.some((plan) => plan.issues.length)) return
    const keys = new Set(frozen.map((plan) => plan.key))
    const kept = results.filter((result) => !keys.has(result.plan.key))
    setOpen(false)
    setRunning(true)
    onBusyChange(true)
    stop.current = false
    try {
      const completed = await executeBatch(
        frozen,
        (next) => setResults([...kept, ...next]),
        () => stop.current,
        new Set(kept.filter((result) => result.state === 'success').map((result) => result.plan.key)),
      )
      onComplete(label, completed)
      const success = completed.filter((item) => item.state === 'success').length
      toast.add({
        title: `${label}执行结束`,
        description: `成功 ${success} 项；其余 ${completed.length - success} 项请查看逐项结果。`,
        type: success === completed.length ? 'success' : 'warning',
      })
    } catch (error) {
      toast.add({ title: '执行失败', description: error instanceof Error ? error.message : '未知错误', type: 'error' })
    } finally {
      setRunning(false)
      onBusyChange(false)
    }
  }

  function retry(state: 'failed' | 'skipped') {
    setPlans(results.filter((result) => result.state === state).map((result) => result.plan))
    setOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={destructive ? 'destructive' : 'default'}
          disabled={disabled || busy || preparing || running}
          onClick={() => void preview()}
        >
          {preparing ? <Spinner data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}预览并{label}
        </Button>
        {running ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              stop.current = true
            }}
          >
            <SquareIcon data-icon="inline-start" />
            停止后续执行
          </Button>
        ) : null}
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!running) setOpen(next)
        }}
      >
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>确认{label}</DialogTitle>
            <DialogDescription>
              共 {plans.length} 项，涉及 {new Set(plans.map((plan) => plan.domainId)).size} 个域名 / DNS
              账户组合。只有点击确认后才会发送写入请求。服务商要求独立保存的备注会单列一步，前置修改失败则不执行该备注。
            </DialogDescription>
          </DialogHeader>
          {destructive ? (
            <Alert variant="destructive">
              <AlertDescription>删除后会立即生效，无法在这里撤销。请核对范围和每一项记录。</AlertDescription>
            </Alert>
          ) : null}
          {issues.length ? (
            <Alert variant="destructive">
              <AlertDescription>
                有 {issues.length} 项校验失败，必须全部修正后才能执行：
                {issues
                  .slice(0, 4)
                  .map((plan) => `${plan.domainName} / ${plan.name}：${plan.issues.join('；')}`)
                  .join('；')}
              </AlertDescription>
            </Alert>
          ) : null}
          <BatchPagedTable
            rows={plans}
            rowKey={(plan) => plan.key}
            columns={[
              {
                key: 'domain',
                label: '域名 / 账户',
                render: (plan) => (
                  <div>
                    {plan.domainName}
                    <p className="text-xs text-muted-foreground">{plan.provider}</p>
                  </div>
                ),
              },
              { key: 'name', label: '主机记录', render: (plan) => <code>{plan.name}</code> },
              {
                key: 'before',
                label: '修改前',
                className: 'min-w-52 whitespace-normal align-top',
                render: (plan) => (
                  <span className="block max-w-72 break-all whitespace-pre-line">
                    {plan.before?.replaceAll(' · ', '\n') ?? '—'}
                  </span>
                ),
              },
              {
                key: 'after',
                label: '执行内容',
                className: 'min-w-52 whitespace-normal align-top',
                render: (plan) => (
                  <span className="block max-w-96 break-all whitespace-pre-line">
                    {plan.after?.replaceAll(' · ', '\n') ?? '—'}
                  </span>
                ),
              },
              {
                key: 'check',
                label: '校验',
                className: 'whitespace-normal',
                render: (plan) =>
                  plan.issues.length ? (
                    <span className="text-destructive">{plan.issues.join('；')}</span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <Badge variant="secondary">
                        <CheckIcon data-icon="inline-start" />
                        可执行
                      </Badge>
                      {plan.dependsOn ? (
                        <span className="text-xs text-muted-foreground">前置修改成功后执行</span>
                      ) : null}
                    </div>
                  ),
              },
            ]}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              返回修改
            </Button>
            <Button
              type="button"
              variant={destructive ? 'destructive' : 'default'}
              disabled={!!issues.length || !plans.length || running || busy || preparing}
              onClick={() => void run()}
            >
              确认{label} {plans.length} 项
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {results.length ? (
        <Card>
          <CardHeader>
            <CardTitle>执行结果</CardTitle>
            <CardDescription>每项单独执行并记录结果；结果待核对的请求不会自动重试，避免重复写入。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {running ? (
              <Progress
                value={
                  (100 * results.filter((result) => !['pending', 'running'].includes(result.state)).length) /
                  results.length
                }
              />
            ) : null}
            <p className="text-sm text-muted-foreground">
              成功 {results.filter((result) => result.state === 'success').length} · 失败{' '}
              {results.filter((result) => result.state === 'failed').length} · 待核对{' '}
              {results.filter((result) => result.state === 'unknown').length} · 未执行{' '}
              {results.filter((result) => result.state === 'skipped').length}
            </p>
            {!running ? (
              <div className="flex flex-wrap gap-2">
                {results.some((result) => result.state === 'failed') ? (
                  <Button type="button" variant="outline" disabled={busy || preparing} onClick={() => retry('failed')}>
                    预览重试明确失败项
                  </Button>
                ) : null}
                {results.some((result) => result.state === 'skipped') ? (
                  <Button type="button" variant="outline" disabled={busy || preparing} onClick={() => retry('skipped')}>
                    预览继续未执行项
                  </Button>
                ) : null}
              </div>
            ) : null}
            <BatchPagedTable
              rows={results}
              rowKey={(result) => result.plan.key}
              columns={[
                {
                  key: 'domain',
                  label: '域名 / 主机记录',
                  render: (result) => `${result.plan.domainName} / ${result.plan.name}`,
                },
                {
                  key: 'state',
                  label: '结果',
                  render: (result) => (
                    <Badge
                      variant={result.state === 'failed' || result.state === 'unknown' ? 'destructive' : 'secondary'}
                    >
                      {BATCH_STATE_LABELS[result.state]}
                    </Badge>
                  ),
                },
                {
                  key: 'message',
                  label: '详情',
                  className: 'whitespace-normal break-all',
                  render: (result) => result.message ?? result.plan.after ?? '—',
                },
              ]}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
