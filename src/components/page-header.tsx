import type { ReactNode } from 'react'

const categoryLabels: Record<string, string> = {
  Account: '个人账户',
  Administration: '管理',
  Automation: '自动化',
  Certificates: '证书',
  Cloudflare: '第三方高级功能',
  Dashboard: '概览',
  DNS: 'DNS 管理',
  'DNS Records': 'DNS 管理',
  'DNS Tools': 'DNS 管理',
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  const category = title === '域名账户' ? '账户管理' : eyebrow ? (categoryLabels[eyebrow] ?? eyebrow) : undefined

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {category ? (
          <p className="mb-1 text-xs font-semibold tracking-[0.16em] text-primary uppercase">{category}</p>
        ) : null}
        <h1 className="truncate font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
