import { useEffect, type ReactNode } from 'react'

function currentReturnTo(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

export function LoginRedirect({
  loginPath,
  fallback = null,
}: {
  loginPath: string
  fallback?: ReactNode
}) {
  useEffect(() => {
    const target = new URL(loginPath, window.location.origin)
    if (!target.searchParams.has('returnTo')) {
      target.searchParams.set('returnTo', currentReturnTo())
    }
    window.location.replace(target.href)
  }, [loginPath])

  return fallback
}
