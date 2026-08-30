import { RefreshCwIcon, ShieldAlertIcon } from 'lucide-react'

import { loginPathFromError } from '@/api/client'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function QueryError({ error, retry }: { error: unknown; retry: () => void }) {
  const loginPath = loginPathFromError(error)
  const message = error instanceof Error ? error.message : '请求失败'

  return (
    <Alert variant="destructive" className="py-3">
      <ShieldAlertIcon />
      <AlertTitle>{loginPath ? '登录状态已失效' : '数据加载失败'}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      <AlertAction>
        {loginPath ? (
          <Button size="sm" variant="outline" nativeButton={false} render={<a href={loginPath} />}>
            重新登录
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={retry}>
            <RefreshCwIcon data-icon="inline-start" />
            重试
          </Button>
        )}
      </AlertAction>
    </Alert>
  )
}
