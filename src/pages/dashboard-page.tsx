import { useQuery } from '@tanstack/react-query'
import {
  ActivityIcon,
  DatabaseIcon,
  EraserIcon,
  Globe2Icon,
  RadioTowerIcon,
  RefreshCwIcon,
  ServerIcon,
  ShieldCheckIcon,
  ZapIcon,
} from 'lucide-react'

import { apiGet, apiPost } from '@/api/client'
import type { DashboardOverview, DashboardReleaseInfo, DataResponse, OperationResult } from '@/api/types'
import { PageHeader } from '@/components/page-header'
import { QueryError } from '@/components/query-error'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { displayValue } from '@/lib/format'

function MetricCard({ title, value, description, icon: Icon }: { title: string; value: number; description: string; icon: typeof Globe2Icon }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value.toLocaleString()}</CardTitle>
        <CardAction><span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon /></span></CardAction>
      </CardHeader>
      <CardContent><p className="text-xs text-muted-foreground">{description}</p></CardContent>
    </Card>
  )
}

function HealthRow({ label, current, total }: { label: string; current: number; total: number }) {
  const value = total > 0 ? Math.round(current / total * 100) : 0
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span>{label}</span><span className="tabular-nums text-muted-foreground">{current} / {total}</span>
      </div>
      <Progress value={value} />
    </div>
  )
}

export function DashboardPage() {
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await apiGet<DataResponse<DashboardOverview>>('/api/web/v1/dashboard')).data,
    refetchInterval: 60_000,
  })
  const release = useQuery({
    queryKey: ['dashboard-release'],
    queryFn: async () => (await apiGet<DataResponse<DashboardReleaseInfo>>('/api/web/v1/dashboard/release')).data,
    staleTime: 60 * 60 * 1000,
  })
  const clearCache = useApiMutation<void, DataResponse<OperationResult>>({
    mutationFn: () => apiPost('/api/web/v1/dashboard/cache/clear', {}),
    successMessage: '缓存已清理',
    invalidate: [['dashboard']],
  })

  if (query.isError) return <QueryError error={query.error} retry={() => void query.refetch()} />
  if (query.isPending) {
    return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-36" />)}</div>
  }
  const data = query.data
  const monitoringTotal = data.monitoring.active || data.totals.monitoringTasks
  const certificateTotal = data.certificates.issued + data.certificates.failed + data.certificates.expiringSoon + data.certificates.expired
  const deploymentTotal = data.deployments.pending + data.deployments.succeeded + data.deployments.failed
  const optimizeTotal = data.optimizeIp.succeeded + data.optimizeIp.failed

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Dashboard"
        title="运行概览"
        description="集中查看 DNS、监控、优选 IP 与证书任务的当前状态。"
        action={
          <Button variant="outline" disabled={clearCache.isPending} onClick={() => clearCache.mutate()}>
            <EraserIcon data-icon="inline-start" />清理缓存
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="域名" value={data.totals.domains} description="当前纳管的 DNS 域名" icon={Globe2Icon} />
        <MetricCard title="监控任务" value={data.totals.monitoringTasks} description="解析可用性监控任务" icon={RadioTowerIcon} />
        <MetricCard title="证书订单" value={data.totals.certificateOrders} description="托管签发与导入证书" icon={ShieldCheckIcon} />
        <MetricCard title="部署任务" value={data.totals.certificateDeployments} description="自动证书部署任务" icon={ServerIcon} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>解析监控</CardTitle>
            <CardDescription>工作进程及任务健康度</CardDescription>
            <CardAction><StatusBadge value={data.monitoring.workerRunning ? 'running' : 'stopped'} /></CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <HealthRow label="健康任务" current={data.monitoring.healthy} total={monitoringTotal} />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted p-3"><p className="text-muted-foreground">运行中</p><p className="mt-1 text-xl font-semibold tabular-nums">{data.monitoring.active}</p></div>
              <div className="rounded-lg bg-muted p-3"><p className="text-muted-foreground">异常</p><p className="mt-1 text-xl font-semibold tabular-nums">{data.monitoring.failed}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>优选 IP</CardTitle><CardDescription>自动更新任务执行概况</CardDescription><CardAction><ZapIcon className="text-primary" /></CardAction></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <HealthRow label="成功任务" current={data.optimizeIp.succeeded} total={optimizeTotal} />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted p-3"><p className="text-muted-foreground">已启用</p><p className="mt-1 text-xl font-semibold tabular-nums">{data.optimizeIp.active}</p></div>
              <div className="rounded-lg bg-muted p-3"><p className="text-muted-foreground">失败</p><p className="mt-1 text-xl font-semibold tabular-nums">{data.optimizeIp.failed}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>证书状态</CardTitle><CardDescription>签发与有效期概况</CardDescription><CardAction><ShieldCheckIcon className="text-primary" /></CardAction></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <HealthRow label="已签发" current={data.certificates.issued} total={certificateTotal} />
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg bg-muted p-3"><p className="font-semibold tabular-nums">{data.certificates.expiringSoon}</p><p className="text-xs text-muted-foreground">即将过期</p></div>
              <div className="rounded-lg bg-muted p-3"><p className="font-semibold tabular-nums">{data.certificates.expired}</p><p className="text-xs text-muted-foreground">已过期</p></div>
              <div className="rounded-lg bg-muted p-3"><p className="font-semibold tabular-nums">{data.certificates.failed}</p><p className="text-xs text-muted-foreground">失败</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>证书部署</CardTitle><CardDescription>最近部署任务状态</CardDescription><CardAction><ActivityIcon className="text-primary" /></CardAction></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <HealthRow label="成功任务" current={data.deployments.succeeded} total={deploymentTotal} />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted p-3"><p className="text-muted-foreground">待处理</p><p className="mt-1 text-xl font-semibold tabular-nums">{data.deployments.pending}</p></div>
              <div className="rounded-lg bg-muted p-3"><p className="text-muted-foreground">失败</p><p className="mt-1 text-xl font-semibold tabular-nums">{data.deployments.failed}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <Card>
          <CardHeader><CardTitle>服务器信息</CardTitle><CardDescription>当前运行环境与版本</CardDescription><CardAction><DatabaseIcon className="text-primary" /></CardAction></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ['应用框架', data.server.frameworkVersion], ['PHP', data.server.phpVersion], ['数据库', data.server.databaseVersion],
              ['Web 服务', data.server.webServer], ['服务器时间', data.server.serverTime],
            ].map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{displayValue(value)}</p></div>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>版本信息</CardTitle><CardDescription>当前安装版本与可用更新</CardDescription><CardAction><RefreshCwIcon className="text-primary" /></CardAction></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div><p className="text-xs text-muted-foreground">当前 Build</p><p className="mt-1 text-2xl font-semibold tabular-nums">{release.data?.currentBuild ?? '—'}</p></div>
            {release.data?.status === 'update-available' ? <div className="rounded-lg bg-primary/10 p-3 text-sm"><p className="font-medium text-primary">发现新版本 V{release.data.latestVersion}</p><p className="text-muted-foreground">Build {release.data.latestBuild}</p></div> : release.data?.status === 'current' ? <p className="text-sm text-muted-foreground">当前已是最新版本。</p> : release.data?.status === 'disabled' ? <p className="text-sm text-muted-foreground">版本检查未启用。</p> : <p className="text-sm text-muted-foreground">暂时无法获取最新版本信息。</p>}
            <div className="flex flex-wrap gap-2">{release.data?.status === 'update-available' && release.data.releaseUrl ? <Button size="sm" nativeButton={false} render={<a href={release.data.releaseUrl} target="_blank" rel="noreferrer" />}>查看更新</Button> : null}<Button size="sm" variant="outline" disabled={release.isFetching} onClick={() => void release.refetch()}><RefreshCwIcon data-icon="inline-start" />重新检查</Button></div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
