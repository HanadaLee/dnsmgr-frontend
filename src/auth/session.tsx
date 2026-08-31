import { useQuery } from '@tanstack/react-query'
import { RefreshCwIcon, ServerCrashIcon } from 'lucide-react'
import { Outlet } from 'react-router-dom'

import { apiGet, errorMessage, loginPathFromError } from '@/api/client'
import { LoginRedirect } from '@/auth/login-redirect'
import type { DataResponse, WebSession } from '@/api/types'
import { SessionContext } from '@/auth/session-context'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function LoadingScreen() {
  return <main className="min-h-svh bg-background" aria-busy="true" aria-label="正在读取登录状态" />
}

function ErrorScreen({ error, retry }: { error: unknown; retry: () => void }) {
  const message = errorMessage(error)

  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 px-4">
      <Card className="w-full max-w-md shadow-lg shadow-black/5">
        <CardHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ServerCrashIcon />
          </div>
          <CardTitle>暂时无法进入控制台</CardTitle>
          <CardDescription>服务暂时无法返回有效登录状态，请稍后重试。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert variant="destructive">
            <AlertTitle>登录状态读取失败</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
          <Button className="flex-1" variant="outline" onClick={retry}>
            <RefreshCwIcon data-icon="inline-start" />
            重试
          </Button>
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
    const loginPath = loginPathFromError(sessionQuery.error)
    if (loginPath) {
      return <LoginRedirect loginPath={loginPath} fallback={<LoadingScreen />} />
    }
    return <ErrorScreen error={sessionQuery.error} retry={() => void sessionQuery.refetch()} />
  }

  return (
    <SessionContext.Provider value={sessionQuery.data}>
      <Outlet />
    </SessionContext.Provider>
  )
}
