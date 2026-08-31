import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CopyIcon, KeyRoundIcon, ShieldCheckIcon, ShieldOffIcon } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

import { apiDelete, apiGet, apiPost, apiPut } from '@/api/client'
import type { DataResponse, OperationResult, ProfileSecurity, TotpEnrollment } from '@/api/types'
import { useSession } from '@/auth/session-context'
import { ConfirmAction } from '@/components/confirm-action'
import { FormDialog } from '@/components/form-dialog'
import { LoadingTable } from '@/components/loading-table'
import { PageHeader } from '@/components/page-header'
import { QueryError } from '@/components/query-error'
import { StatusBadge } from '@/components/status-badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { formatDateTime, initials } from '@/lib/format'

export function ProfilePage() {
  const session = useSession()
  const security = useQuery({ queryKey: ['profile-security'], queryFn: async () => (await apiGet<DataResponse<ProfileSecurity>>('/api/web/v1/profile/security')).data })
  const password = useApiMutation<Record<string, unknown>, DataResponse<OperationResult>>({ mutationFn: (body) => apiPut('/api/web/v1/profile/password', body), successMessage: '密码已修改' })
  const disableTotp = useApiMutation<void, DataResponse<OperationResult>>({ mutationFn: () => apiDelete('/api/web/v1/profile/totp'), successMessage: '两步验证已关闭', invalidate: [['profile-security']] })
  return <div className="flex flex-col gap-6"><PageHeader eyebrow="Account" title="个人资料" description="查看账户信息并维护可用的登录安全设置。" /><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>账户信息</CardTitle><CardDescription>当前登录账户的基本资料。</CardDescription></CardHeader><CardContent className="flex items-center gap-4"><Avatar size="lg">{session.user.avatar ? <AvatarImage src={session.user.avatar} alt="" /> : null}<AvatarFallback>{initials(session.user.displayName)}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate font-medium">{session.user.displayName}</p><p className="truncate text-sm text-muted-foreground">{session.user.email ?? session.user.name}</p><p className="mt-1 text-xs text-muted-foreground">注册时间：{formatDateTime(session.user.registeredAt)}</p></div></CardContent></Card>{security.isError ? <QueryError error={security.error} retry={() => void security.refetch()} /> : security.isPending ? <LoadingTable /> : security.data.localCredentialsAvailable ? <Card><CardHeader><CardTitle>登录安全</CardTitle><CardDescription>修改密码并管理基于动态口令的两步验证。</CardDescription><CardAction><StatusBadge value={security.data.totpEnabled} label={security.data.totpEnabled ? '两步验证已开启' : '两步验证未开启'} /></CardAction></CardHeader><CardContent className="flex flex-wrap gap-2"><FormDialog trigger={<Button variant="outline"><KeyRoundIcon data-icon="inline-start" />修改密码</Button>} title="修改密码" fields={[{ name: 'currentPassword', label: '当前密码', kind: 'password', required: true }, { name: 'newPassword', label: '新密码', kind: 'password', required: true }, { name: 'confirmPassword', label: '确认新密码', kind: 'password', required: true }]} pending={password.isPending} onSubmit={(values, close) => { if (values.newPassword !== values.confirmPassword) { toast.add({ title: '两次输入的新密码不一致', type: 'error' }); return } password.mutate({ currentPassword: values.currentPassword, newPassword: values.newPassword }, { onSuccess: close }) }} />{security.data.totpEnabled ? <ConfirmAction trigger={<Button variant="destructive"><ShieldOffIcon data-icon="inline-start" />关闭两步验证</Button>} title="关闭两步验证？" description="关闭后登录时不再要求动态口令。" destructive pending={disableTotp.isPending} onConfirm={() => disableTotp.mutate()} /> : <TotpEnrollmentDialog />}</CardContent></Card> : <Card><CardHeader><CardTitle>登录安全</CardTitle><CardDescription>此账户无需在本页维护本地密码或两步验证。</CardDescription><CardAction><ShieldCheckIcon className="text-primary" /></CardAction></CardHeader><CardContent><p className="text-sm text-muted-foreground">如需修改登录凭据，请前往统一账户中心。</p></CardContent></Card>}</div></div>
}

function TotpEnrollmentDialog() {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const enrollment = useQuery({ queryKey: ['totp-enrollment'], queryFn: async () => (await apiPost<DataResponse<TotpEnrollment>>('/api/web/v1/profile/totp/enrollment', {})).data, enabled: open, staleTime: 0 })
  const bind = useApiMutation<void, DataResponse<OperationResult>>({ mutationFn: () => { if (!enrollment.data) throw new Error('初始化信息尚未生成'); return apiPut('/api/web/v1/profile/totp', { secret: enrollment.data.secret, code }) }, successMessage: '两步验证已开启', invalidate: [['profile-security']] })
  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setCode('') }}><DialogTrigger render={<Button />}><ShieldCheckIcon data-icon="inline-start" />开启两步验证</DialogTrigger><DialogContent><DialogHeader><DialogTitle>开启两步验证</DialogTitle><DialogDescription>使用身份验证器扫描二维码，然后输入 6 位动态口令完成绑定。</DialogDescription></DialogHeader>{enrollment.isError ? <QueryError error={enrollment.error} retry={() => void enrollment.refetch()} /> : enrollment.isPending ? <LoadingTable rows={3} /> : <FieldGroup><div className="mx-auto rounded-xl border bg-white p-3"><QRCodeSVG value={enrollment.data.provisioningUri} size={180} level="M" title="两步验证配置二维码" /></div><Field><FieldLabel>密钥</FieldLabel><div className="flex gap-2"><code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2">{enrollment.data.secret}</code><Button size="icon" variant="outline" aria-label="复制密钥" onClick={() => { void navigator.clipboard.writeText(enrollment.data.secret); toast.add({ title: '密钥已复制', type: 'success' }) }}><CopyIcon /></Button></div></Field><Field><FieldLabel>配置 URI</FieldLabel><code className="block break-all rounded-lg bg-muted p-3 text-xs">{enrollment.data.provisioningUri}</code><FieldDescription>无法扫描时，可在身份验证器中手动输入密钥或导入 URI。</FieldDescription></Field><Field><FieldLabel>动态口令</FieldLabel><InputOTP maxLength={6} value={code} onChange={setCode}><InputOTPGroup>{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} />)}</InputOTPGroup></InputOTP></Field></FieldGroup>}<DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button disabled={bind.isPending || code.length !== 6} onClick={() => bind.mutate(undefined, { onSuccess: () => setOpen(false) })}>{bind.isPending ? <Spinner data-icon="inline-start" /> : null}确认开启</Button></DialogFooter></DialogContent></Dialog>
}
