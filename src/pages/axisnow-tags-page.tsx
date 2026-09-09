import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MoreHorizontalIcon, PencilIcon, PlusIcon, RefreshCwIcon, SearchIcon, Trash2Icon } from 'lucide-react'

import { apiDelete, apiGet, apiPost, apiPut } from '@/api/client'
import type { AxisNowAccount, AxisNowTag, DataResponse, OperationResult, PageResponse } from '@/api/types'
import { ConfirmAction } from '@/components/confirm-action'
import { DataTable, type DataColumn } from '@/components/data-table'
import { ListPagination } from '@/components/list-pagination'
import { LoadingTable } from '@/components/loading-table'
import { QueryError } from '@/components/query-error'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { formatDateTime } from '@/lib/format'

export function AxisNowTagsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [queryText, setQueryText] = useState('')
  const [accountId, setAccountId] = useState('')
  const accounts = useQuery({ queryKey: ['axisnow-accounts'], queryFn: async () => (await apiGet<DataResponse<AxisNowAccount[]>>('/api/web/v1/axisnow/accounts')).data })
  const tags = useQuery({ queryKey: ['axisnow-tags', page, queryText, accountId], queryFn: () => apiGet<PageResponse<AxisNowTag>>('/api/web/v1/axisnow/tags', { page, pageSize: 20, q: queryText, accountId: accountId || undefined, sort: 'updated_at', order: 'desc' }) })
  const remove = useApiMutation<AxisNowTag, DataResponse<OperationResult>>({
    mutationFn: (tag) => apiDelete(`/api/web/v1/axisnow/accounts/${tag.accountId}/tags/${tag.uuid}`),
    successMessage: '标签已删除',
    invalidate: [['axisnow-tags'], ['axisnow-options'], ['axisnow-eips']],
  })
  const columns: DataColumn<AxisNowTag>[] = [
    { key: 'name', label: '名称', render: (tag) => <div className="min-w-48"><p className="font-medium">{tag.name}</p><p className="text-xs text-muted-foreground">关联 {tag.boundCount} 个 EIP</p></div> },
    { key: 'account', label: '平台账户', render: (tag) => tag.accountName },
    { key: 'bound', label: '已绑定', render: (tag) => tag.boundCount },
    { key: 'reference', label: '被规则引用', render: (tag) => tag.referencedCount },
    { key: 'description', label: '说明', render: (tag) => tag.description ?? '—' },
    { key: 'time', label: '更新时间', render: (tag) => formatDateTime(tag.updatedAt) },
    {
      key: 'actions', label: '', className: 'w-12', render: (tag) => (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`管理 ${tag.name}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuGroup>
            <TagDialog trigger={<DropdownMenuItem closeOnClick={false}><PencilIcon />编辑</DropdownMenuItem>} accounts={accounts.data ?? []} tag={tag} />
            <ConfirmAction trigger={<DropdownMenuItem variant="destructive" closeOnClick={false}><Trash2Icon />删除</DropdownMenuItem>} title="删除标签？" description={`${tag.name} 被引用时可能无法删除。`} destructive pending={remove.isPending} onConfirm={() => remove.mutate(tag)} />
          </DropdownMenuGroup></DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]
  const reset = () => {
    setSearch('')
    setQueryText('')
    setAccountId('')
    setPage(1)
    void tags.refetch()
  }

  return (
    <div className="flex flex-col gap-6">
      <Card><CardContent className="flex flex-col gap-4 pt-6">
        <form className="grid gap-2 lg:grid-cols-[minmax(16rem,1fr)_14rem_auto_auto_auto]" onSubmit={(event) => { event.preventDefault(); setPage(1); setQueryText(search.trim()) }}>
          <div className="relative"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索标签、说明或平台账户" /></div>
          <Select items={[{ value: 'all', label: '全部平台账户' }, ...(accounts.data ?? []).map((account) => ({ value: String(account.id), label: account.name }))]} value={accountId || 'all'} onValueChange={(value) => { setAccountId(value === 'all' ? '' : value ?? ''); setPage(1) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部平台账户</SelectItem>{(accounts.data ?? []).map((account) => <SelectItem key={account.id} value={String(account.id)}>{account.name}</SelectItem>)}</SelectGroup></SelectContent></Select>
          <Button type="submit"><SearchIcon data-icon="inline-start" />搜索</Button>
          <Button type="button" variant="outline" onClick={reset}><RefreshCwIcon data-icon="inline-start" />刷新</Button>
          <TagDialog trigger={<Button type="button"><PlusIcon data-icon="inline-start" />添加</Button>} accounts={accounts.data ?? []} />
        </form>
        {accounts.isError ? <QueryError error={accounts.error} retry={() => void accounts.refetch()} /> : null}
        {tags.isError ? <QueryError error={tags.error} retry={() => void tags.refetch()} /> : tags.isPending ? <LoadingTable /> : <DataTable rows={tags.data.data} columns={columns} rowKey={(tag) => `${tag.accountId}:${tag.uuid}`} emptyTitle="暂无标签" />}
        {tags.data ? <ListPagination meta={tags.data.meta} onPageChange={setPage} /> : null}
      </CardContent></Card>
    </div>
  )
}

function TagDialog({ trigger, accounts, tag }: { trigger: React.ReactElement; accounts: AxisNowAccount[]; tag?: AxisNowTag }) {
  const [open, setOpen] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const detail = useQuery({
    queryKey: ['axisnow-tag', tag?.accountId, tag?.uuid],
    queryFn: async () => (await apiGet<DataResponse<AxisNowTag>>(`/api/web/v1/axisnow/accounts/${tag?.accountId}/tags/${tag?.uuid}`)).data,
    enabled: open && Boolean(tag),
  })
  const save = useApiMutation<Record<string, unknown>, DataResponse<OperationResult>>({
    mutationFn: (body) => tag ? apiPut(`/api/web/v1/axisnow/tags/${tag.uuid}`, body) : apiPost('/api/web/v1/axisnow/tags', body),
    successMessage: tag ? '标签已更新' : '标签已添加',
    invalidate: [['axisnow-tags'], ['axisnow-options'], ['axisnow-eips']],
  })

  useEffect(() => {
    if (!open) return
    setAccountId(String(tag?.accountId ?? accounts[0]?.id ?? ''))
    setName(tag?.name ?? '')
    setDescription(tag?.description ?? '')
  }, [accounts, open, tag])

  useEffect(() => {
    if (!detail.data) return
    setName(detail.data.name)
    setDescription(detail.data.description ?? '')
  }, [detail.data])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <form onSubmit={(event) => { event.preventDefault(); save.mutate({ accountId: Number(accountId), name, description: description || null }, { onSuccess: () => setOpen(false) }) }}>
          <DialogHeader><DialogTitle>{tag ? '编辑标签' : '新增标签'}</DialogTitle><DialogDescription>标签用于批量组织 EIP 并被 DNS 路由规则引用。</DialogDescription></DialogHeader>
          <div className="py-5"><FieldGroup>
            <Field><FieldLabel>平台账户</FieldLabel><Select items={accounts.map((account) => ({ value: String(account.id), label: account.name }))} value={accountId || null} disabled={Boolean(tag)} onValueChange={(value) => setAccountId(value ?? '')}><SelectTrigger className="w-full"><SelectValue placeholder="请选择平台账户" /></SelectTrigger><SelectContent><SelectGroup>{accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>{account.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="axisnow-tag-name">标签名称</FieldLabel><Input id="axisnow-tag-name" value={name} maxLength={50} required onChange={(event) => setName(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="axisnow-tag-description">说明</FieldLabel><Textarea id="axisnow-tag-description" value={description} maxLength={255} onChange={(event) => setDescription(event.target.value)} /></Field>
          </FieldGroup>{detail.isError ? <QueryError error={detail.error} retry={() => void detail.refetch()} /> : null}</div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button><Button type="submit" disabled={save.isPending || !accountId || !name.trim()}>{save.isPending ? <Spinner data-icon="inline-start" /> : null}确认</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
