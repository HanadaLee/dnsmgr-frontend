import { useQuery } from '@tanstack/react-query'
import { KeyRoundIcon, RefreshCwIcon, ServerCrashIcon } from 'lucide-react'
import { Outlet } from 'react-router-dom'

import { apiGet, ApiClientError, loginPathFromError } from '@/api/client'
import type { DataResponse, WebSession } from '@/api/types'
import { SessionContext } from '@/auth/session-context'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

function LoadingScreen() {
  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Skeleton className="size-11 rounded-xl" />
          <Skeleton className="mt-2 h-5 w-36" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-4/5" />
        </CardContent>
      </Card>
    </main>
  )
}

function ErrorScreen({ error, retry }: { error: unknown; retry: () => void }) {
  const loginPath = loginPathFromError(error)
  const message = error instanceof Error ? error.message : '无法读取登录状态'

  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 px-4">
      <Card className="w-full max-w-md shadow-lg shadow-black/5">
        <CardHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {loginPath ? <KeyRoundIcon /> : <ServerCrashIcon />}
          </div>
          <CardTitle>{loginPath ? '需要统一身份认证' : '暂时无法进入控制台'}</CardTitle>
          <CardDescription>
            {loginPath
              ? 'CAS 会话或原 dnsmgr 登录状态已经失效，请重新完成登录。'
              : 'dnsmgr-helper 未能返回有效登录状态，请检查服务后重试。'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert variant={loginPath ? 'default' : 'destructive'}>
            <AlertTitle>{error instanceof ApiClientError ? error.code : 'SESSION_ERROR'}</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
          <div className="flex gap-2">
            {loginPath ? (
              <Button className="flex-1" nativeButton={false} render={<a href={loginPath} />}>
                前往 CAS 登录
              </Button>
            ) : null}
            <Button className={cn(!loginPath && 'flex-1')} variant="outline" onClick={retry}>
              <RefreshCwIcon data-icon="inline-start" />
              重试
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

export function AuthBoundary() {
  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: async () => (await apiGet<DataResponse<WebSession>>('/api/web/v1/session')).data,
    staleTime: 60_000,
  })

  if (sessionQuery.isPending) return <LoadingScreen />
  if (sessionQuery.isError) {
    return <ErrorScreen error={sessionQuery.error} retry={() => void sessionQuery.refetch()} />
  }

  return (
    <SessionContext.Provider value={sessionQuery.data}>
      <Outlet />
    </SessionContext.Provider>
  )
}
