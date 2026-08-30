import { RefreshCwIcon, ShieldAlertIcon } from 'lucide-react'

import { loginPathFromError } from '@/api/client'
import { LoginRedirect } from '@/auth/login-redirect'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function QueryError({ error, retry }: { error: unknown; retry: () => void }) {
  const loginPath = loginPathFromError(error)
  const message = error instanceof Error ? error.message : '请求失败'

  if (loginPath) return <LoginRedirect loginPath={loginPath} />

  return (
    <Alert variant="destructive" className="py-3">
      <ShieldAlertIcon />
      <AlertTitle>数据加载失败</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      <AlertAction>
        <Button size="sm" variant="outline" onClick={retry}>
          <RefreshCwIcon data-icon="inline-start" />
          重试
        </Button>
      </AlertAction>
    </Alert>
  )
}
