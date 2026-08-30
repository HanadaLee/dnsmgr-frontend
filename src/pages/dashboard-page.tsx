import {
  ArrowRightIcon,
  BoxesIcon,
  CheckCircle2Icon,
  FingerprintIcon,
  Layers3Icon,
  ShieldCheckIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { useSession } from '@/auth/session-context'
import { PageHeader } from '@/components/page-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function DashboardPage() {
  const session = useSession()
  const enabledCapabilities = Object.values(session.capabilities).filter(Boolean).length
  const version = session.upstream.detectedVersion ?? session.upstream.configuredVersion

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Overview"
        title={`你好，${session.user.displayName}`}
        description="独立前端已通过兼容层连接原 dnsmgr。当前阶段只读取登录态、域名和解析记录，不会修改真实 DNS 数据。"
        action={session.capabilities.domains ? (
          <Button nativeButton={false} render={<Link to="/domains" />}>
            查看域名
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        ) : undefined}
      />

      <Alert>
        <ShieldCheckIcon />
        <AlertTitle>安全的只读迁移阶段</AlertTitle>
        <AlertDescription>
          CAS 负责身份，原 dnsmgr 的 user_token 负责最终业务权限；helper 不直接访问数据库，也不接受任意上游路径。
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <Badge variant="secondary"><FingerprintIcon data-icon="inline-start" />身份</Badge>
            <CardTitle>身份链路</CardTitle>
            <CardDescription>当前浏览器会话的身份来源</CardDescription>
            <CardAction>
              <Badge variant={session.sso.profileVerified ? 'default' : 'secondary'}>
                {session.sso.profileVerified ? '双重验证' : '原版会话'}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">CAS 资料</span>
              <span className="font-medium">{session.sso.profileVerified ? '签名有效' : '未启用资料校验'}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">dnsmgr 用户类型</span>
              <span className="font-medium">{session.user.type}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Badge variant="secondary"><Layers3Icon data-icon="inline-start" />适配</Badge>
            <CardTitle>兼容适配器</CardTitle>
            <CardDescription>旧版接口的翻译边界</CardDescription>
            <CardAction><Badge variant="outline">{session.upstream.adapter}</Badge></CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">上游版本</span>
              <span className="font-mono font-medium">{version}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">已识别能力</span>
              <span className="font-medium">{enabledCapabilities} 项</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Badge variant="secondary"><BoxesIcon data-icon="inline-start" />能力</Badge>
            <CardTitle>已迁移功能</CardTitle>
            <CardDescription>当前稳定 API 覆盖范围</CardDescription>
            <CardAction><Badge><CheckCircle2Icon data-icon="inline-start" />就绪</Badge></CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="flex items-center justify-between gap-2"><span>登录态与能力识别</span><Badge variant="outline">已支持</Badge></p>
            <p className="flex items-center justify-between gap-2"><span>域名与解析记录只读查询</span><Badge variant="outline">已支持</Badge></p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
