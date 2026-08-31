import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { apiDelete, apiGet, apiPost, apiPut } from '@/api/client'
import type { DataResponse, DomainCategory, OperationResult, PageResponse } from '@/api/types'
import { ConfirmAction } from '@/components/confirm-action'
import { DataTable, type DataColumn } from '@/components/data-table'
import { FormDialog } from '@/components/form-dialog'
import { ListPagination } from '@/components/list-pagination'
import { LoadingTable } from '@/components/loading-table'
import { PageHeader } from '@/components/page-header'
import { QueryError } from '@/components/query-error'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { formatDateTime } from '@/lib/format'

export function DomainCategoriesPage() {
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('sort')
  const [order, setOrder] = useState('asc')
  const query = useQuery({
    queryKey: ['domain-categories', page, sort, order],
    queryFn: () => apiGet<PageResponse<DomainCategory>>('/api/web/v1/domain-categories', { page, pageSize: 20, sort, order }),
  })
  const save = useApiMutation<{ id?: number; body: Record<string, unknown> }, DataResponse<OperationResult>>({
    mutationFn: ({ id, body }) => id ? apiPut(`/api/web/v1/domain-categories/${id}`, body) : apiPost('/api/web/v1/domain-categories', body),
    successMessage: (_, variables) => variables.id ? '分类已更新' : '分类已添加', invalidate: [['domain-categories'], ['domains']],
  })
  const remove = useApiMutation<number, DataResponse<OperationResult>>({
    mutationFn: (id) => apiDelete(`/api/web/v1/domain-categories/${id}`), successMessage: '分类已删除', invalidate: [['domain-categories'], ['domains']],
  })
  const fields = [
    { name: 'name', label: '分类名称', required: true },
    { name: 'sort', label: '排序值', kind: 'number' as const, description: '数值越小越靠前。' },
    { name: 'remark', label: '备注', kind: 'textarea' as const },
  ]
  const columns: DataColumn<DomainCategory>[] = [
    { key: 'name', label: '分类', render: (category) => <div><p className="font-medium">{category.name}</p><p className="text-xs text-muted-foreground">{category.remark ?? '暂无备注'}</p></div> },
    { key: 'domains', label: '域名数', render: (category) => <span className="tabular-nums">{category.domainCount}</span> },
    { key: 'sort', label: '排序', render: (category) => <span className="tabular-nums">{category.sort}</span> },
    { key: 'time', label: '添加时间', render: (category) => formatDateTime(category.addedAt) },
    { key: 'actions', label: '', className: 'w-12', render: (category) => (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`管理 ${category.name}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuGroup>
          <DropdownMenuItem render={<Link to={`/domains?categoryId=${category.id}`} />}>查看域名</DropdownMenuItem>
          <FormDialog trigger={<DropdownMenuItem onClick={(event) => event.preventDefault()}><PencilIcon />编辑</DropdownMenuItem>} title="编辑分类" fields={fields} initialValues={{ name: category.name, sort: category.sort, remark: category.remark ?? '' }} pending={save.isPending} onSubmit={(values, close) => save.mutate({ id: category.id, body: { name: values.name, sort: Number(values.sort ?? 0), remark: String(values.remark ?? '') || null } }, { onSuccess: close })} />
          <ConfirmAction trigger={<DropdownMenuItem variant="destructive" onClick={(event) => event.preventDefault()}><Trash2Icon />删除</DropdownMenuItem>} title={`删除 ${category.name}？`} description="仅未关联域名的分类可以删除。" destructive pending={remove.isPending} onConfirm={() => remove.mutate(category.id)} />
        </DropdownMenuGroup></DropdownMenuContent>
      </DropdownMenu>
    ) },
  ]
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="DNS" title="域名分类" description="通过分类整理域名，并控制列表展示顺序。" action={<FormDialog trigger={<Button><PlusIcon data-icon="inline-start" />添加分类</Button>} title="添加分类" fields={fields} initialValues={{ sort: 0 }} pending={save.isPending} onSubmit={(values, close) => save.mutate({ body: { name: values.name, sort: Number(values.sort ?? 0), remark: String(values.remark ?? '') || null } }, { onSuccess: close })} />} />
      <Card><CardContent className="flex flex-col gap-4 pt-6">
        <div className="grid gap-2 sm:grid-cols-2 sm:justify-end lg:grid-cols-[12rem_8rem] lg:self-end"><Select items={[{ value: 'sort', label: '按排序值' }, { value: 'id', label: '按添加顺序' }, { value: 'name', label: '按分类名称' }, { value: 'remark', label: '按备注' }, { value: 'addedAt', label: '按添加时间' }]} value={sort} onValueChange={(value) => { setSort(value ?? 'sort'); setPage(1) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="sort">按排序值</SelectItem><SelectItem value="id">按添加顺序</SelectItem><SelectItem value="name">按分类名称</SelectItem><SelectItem value="remark">按备注</SelectItem><SelectItem value="addedAt">按添加时间</SelectItem></SelectGroup></SelectContent></Select><Select items={[{ value: 'asc', label: '升序' }, { value: 'desc', label: '降序' }]} value={order} onValueChange={(value) => { setOrder(value ?? 'asc'); setPage(1) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="asc">升序</SelectItem><SelectItem value="desc">降序</SelectItem></SelectGroup></SelectContent></Select></div>
        {query.isError ? <QueryError error={query.error} retry={() => void query.refetch()} /> : query.isPending ? <LoadingTable /> : <DataTable rows={query.data.data} columns={columns} rowKey={(category) => String(category.id)} emptyTitle="暂无分类" />}
        {query.data ? <ListPagination meta={query.data.meta} onPageChange={setPage} /> : null}
      </CardContent></Card>
    </div>
  )
}
