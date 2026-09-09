import { useEffect, useState, type ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { KeyRoundIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, RefreshCwIcon, SearchIcon, Trash2Icon } from 'lucide-react'

import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/api/client'
import type { DataResponse, OperationResult, PageResponse, UserDetail, UserFormOptions, UserSummary } from '@/api/types'
import { ConfirmAction } from '@/components/confirm-action'
import { DataTable, type DataColumn } from '@/components/data-table'
import { ListPagination } from '@/components/list-pagination'
import { LoadingTable } from '@/components/loading-table'
import { PageHeader } from '@/components/page-header'
import { QueryError } from '@/components/query-error'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { formatDateTime } from '@/lib/format'

function randomApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

function randomPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

export function UsersPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [queryText, setQueryText] = useState('')
  const [sort, setSort] = useState('id')
  const [order, setOrder] = useState('desc')
  const users = useQuery({ queryKey: ['users', page, queryText, sort, order], queryFn: () => apiGet<PageResponse<UserSummary>>('/api/web/v1/users', { page, pageSize: 20, q: queryText, sort, order }) })
  const form = useQuery({ queryKey: ['users-form'], queryFn: async () => (await apiGet<DataResponse<UserFormOptions>>('/api/web/v1/users/form')).data })
  const remove = useApiMutation<number, DataResponse<OperationResult>>({ mutationFn: (id) => apiDelete(`/api/web/v1/users/${id}`), successMessage: '用户已删除', invalidate: [['users']] })
  const status = useApiMutation<UserSummary, DataResponse<OperationResult>>({ mutationFn: (user) => apiPatch(`/api/web/v1/users/${user.id}/status`, { enabled: !user.enabled }), successMessage: '用户状态已更新', invalidate: [['users']] })
  const columns: DataColumn<UserSummary>[] = [
    { key: 'name', label: '用户', render: (user) => <div><p className="font-medium">{user.username}</p><p className="text-xs text-muted-foreground">ID {user.id}</p></div> },
    { key: 'role', label: '角色', render: (user) => <Badge variant={user.role === 'administrator' ? 'default' : 'secondary'}>{user.role === 'administrator' ? '管理员' : '用户'}</Badge> },
    { key: 'api', label: 'API', render: (user) => <StatusBadge value={user.apiEnabled} /> },
    { key: 'totp', label: '两步验证', render: (user) => <StatusBadge value={user.totpEnabled} /> },
    { key: 'status', label: '状态', render: (user) => <Switch checked={user.enabled} onCheckedChange={() => status.mutate(user)} /> },
    { key: 'login', label: '最后登录', render: (user) => formatDateTime(user.lastLoginAt) },
    { key: 'actions', label: '', className: 'w-12', render: (user) => <DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`管理 ${user.username}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><UserEditor trigger={<DropdownMenuItem closeOnClick={false}><PencilIcon />编辑</DropdownMenuItem>} user={user} options={form.data} /><ConfirmAction trigger={<DropdownMenuItem variant="destructive" closeOnClick={false}><Trash2Icon />删除</DropdownMenuItem>} title={`删除用户 ${user.username}？`} description="用户及其权限将被永久移除。" destructive pending={remove.isPending} onConfirm={() => remove.mutate(user.id)} /></DropdownMenuGroup></DropdownMenuContent></DropdownMenu> },
  ]
  return <div className="flex flex-col gap-6"><PageHeader eyebrow="Administration" title="用户管理" description="管理用户角色、域名权限、本地 API 与账户状态。" action={<UserEditor trigger={<Button><PlusIcon data-icon="inline-start" />添加用户</Button>} options={form.data} />} /><Card><CardContent className="flex flex-col gap-4"><form className="grid gap-2 md:grid-cols-[minmax(14rem,1fr)_12rem_8rem_auto]" onSubmit={(event) => { event.preventDefault(); setPage(1); setQueryText(search.trim()) }}><div className="relative"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索用户名" /></div><Select items={[{ value: 'id', label: '按添加顺序' }, { value: 'username', label: '按用户名' }, { value: 'role', label: '按角色' }, { value: 'apiEnabled', label: '按 API 状态' }, { value: 'registeredAt', label: '按注册时间' }, { value: 'lastLoginAt', label: '按最后登录' }, { value: 'status', label: '按账户状态' }]} value={sort} onValueChange={(value) => { setSort(value ?? 'id'); setPage(1) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="id">按添加顺序</SelectItem><SelectItem value="username">按用户名</SelectItem><SelectItem value="role">按角色</SelectItem><SelectItem value="apiEnabled">按 API 状态</SelectItem><SelectItem value="registeredAt">按注册时间</SelectItem><SelectItem value="lastLoginAt">按最后登录</SelectItem><SelectItem value="status">按账户状态</SelectItem></SelectGroup></SelectContent></Select><Select items={[{ value: 'desc', label: '降序' }, { value: 'asc', label: '升序' }]} value={order} onValueChange={(value) => { setOrder(value ?? 'desc'); setPage(1) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="desc">降序</SelectItem><SelectItem value="asc">升序</SelectItem></SelectGroup></SelectContent></Select><Button type="submit" variant="outline">搜索</Button></form>{form.isError ? <QueryError error={form.error} retry={() => void form.refetch()} /> : null}{users.isError ? <QueryError error={users.error} retry={() => void users.refetch()} /> : users.isPending ? <LoadingTable /> : <DataTable rows={users.data.data} columns={columns} rowKey={(user) => String(user.id)} emptyTitle="暂无用户" />}{users.data ? <ListPagination meta={users.data.meta} onPageChange={setPage} /> : null}</CardContent></Card></div>
}

function UserEditor({ trigger, user, options }: { trigger: ReactElement; user?: UserSummary; options?: UserFormOptions }) {
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'user' | 'administrator'>('user')
  const [apiEnabled, setApiEnabled] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [permissions, setPermissions] = useState<string[]>([])
  const [permissionSearch, setPermissionSearch] = useState('')
  const detail = useQuery({ queryKey: ['user', user?.id], queryFn: async () => (await apiGet<DataResponse<UserDetail>>(`/api/web/v1/users/${user?.id}`)).data, enabled: open && Boolean(user) })
  const save = useApiMutation<Record<string, unknown>, DataResponse<OperationResult>>({ mutationFn: (body) => user ? apiPut(`/api/web/v1/users/${user.id}`, body) : apiPost('/api/web/v1/users', body), successMessage: user ? '用户已更新' : '用户已添加', invalidate: [['users']] })
  useEffect(() => { if (!open || user) return; setUsername(''); setPassword(''); setRole('user'); setApiEnabled(false); setApiKey(''); setPermissions([]); setPermissionSearch('') }, [open, user])
  useEffect(() => { if (!detail.data) return; setUsername(detail.data.username); setPassword(''); setRole(detail.data.role === 'administrator' ? 'administrator' : 'user'); setApiEnabled(detail.data.apiEnabled); setApiKey(detail.data.apiKey ?? ''); setPermissions(detail.data.permissions); setPermissionSearch('') }, [detail.data])
  const permissionDomains = Array.from(new Set([...(options?.domains ?? []), ...permissions]))
  const visibleDomains = permissionDomains.filter((domain) => domain.toLowerCase().includes(permissionSearch.trim().toLowerCase()))
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={trigger} /><DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl"><form onSubmit={(event) => { event.preventDefault(); const common = { username, apiEnabled, apiKey: apiKey || null, role, permissions: role === 'user' ? permissions : [] }; const body = user ? { ...common, resetPassword: password || null } : { ...common, password }; save.mutate(body, { onSuccess: () => setOpen(false) }) }}><DialogHeader><DialogTitle>{user ? '编辑用户' : '添加用户'}</DialogTitle><DialogDescription>管理员拥有全部权限；普通用户只能访问已授权域名。</DialogDescription></DialogHeader><div className="py-5">{detail.isPending && user ? <LoadingTable rows={4} /> : <FieldGroup><Field><FieldLabel htmlFor="username">用户名</FieldLabel><Input id="username" value={username} required onChange={(event) => setUsername(event.target.value)} /></Field><Field><FieldLabel htmlFor="user-password">{user ? '重置密码' : '初始密码'}</FieldLabel><InputGroup><InputGroupInput id="user-password" type="password" value={password} required={!user} onChange={(event) => setPassword(event.target.value)} /><InputGroupAddon align="inline-end"><InputGroupButton type="button" aria-label="生成随机密码" onClick={() => setPassword(randomPassword())}><RefreshCwIcon /></InputGroupButton></InputGroupAddon></InputGroup><FieldDescription>{user ? '留空表示保持不变；也可生成随机密码。' : '用户首次登录时使用，可一键生成随机密码。'}</FieldDescription></Field><Field><FieldLabel>角色</FieldLabel><Select items={[{ value: 'user', label: '普通用户' }, { value: 'administrator', label: '管理员' }]} value={role} onValueChange={(value) => setRole(value === 'administrator' ? 'administrator' : 'user')}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="user">普通用户</SelectItem><SelectItem value="administrator">管理员</SelectItem></SelectGroup></SelectContent></Select></Field>{role === 'user' ? <Field><FieldLabel htmlFor="permission-search">域名权限</FieldLabel><Input id="permission-search" value={permissionSearch} onChange={(event) => setPermissionSearch(event.target.value)} placeholder="搜索域名" /><div className="max-h-56 overflow-y-auto rounded-lg border p-2">{visibleDomains.length ? visibleDomains.map((domain) => <label key={domain} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"><Checkbox checked={permissions.includes(domain)} onCheckedChange={(checked) => setPermissions((current) => checked ? Array.from(new Set([...current, domain])) : current.filter((item) => item !== domain))} /><span className="min-w-0 truncate">{domain}</span></label>) : <p className="px-2 py-4 text-center text-sm text-muted-foreground">没有匹配的域名</p>}</div><div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setPermissions(permissionDomains)}>全选</Button><Button type="button" size="sm" variant="ghost" onClick={() => setPermissions([])}>清空</Button></div><FieldDescription>已选择 {permissions.length} 个域名；留空表示没有域名权限。</FieldDescription></Field> : null}<Field orientation="horizontal"><FieldLabel htmlFor="api-enabled">允许使用 API</FieldLabel><Switch id="api-enabled" checked={apiEnabled} onCheckedChange={setApiEnabled} /></Field>{apiEnabled ? <Field><FieldLabel htmlFor="api-key">API 密钥</FieldLabel><InputGroup><InputGroupInput id="api-key" value={apiKey} maxLength={32} onChange={(event) => setApiKey(event.target.value)} /><InputGroupAddon align="inline-end"><InputGroupButton type="button" aria-label="生成 API 密钥" onClick={() => setApiKey(randomApiKey())}><RefreshCwIcon /></InputGroupButton></InputGroupAddon></InputGroup><FieldDescription>最多 32 个字符，请通过安全方式交付给用户。</FieldDescription></Field> : null}</FieldGroup>}{detail.isError ? <QueryError error={detail.error} retry={() => void detail.refetch()} /> : null}</div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? <Spinner data-icon="inline-start" /> : <KeyRoundIcon data-icon="inline-start" />}保存</Button></DialogFooter></form></DialogContent></Dialog>
}
