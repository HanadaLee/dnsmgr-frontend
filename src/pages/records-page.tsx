import { useQuery } from '@tanstack/react-query'
import { ArrowLeftIcon, CheckIcon, CopyIcon, SearchIcon, SearchXIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'

import { apiGet } from '@/api/client'
import type { DataResponse, DnsRecord, DomainSummary, PageResponse } from '@/api/types'
import { ListPagination } from '@/components/list-pagination'
import { PageHeader } from '@/components/page-header'
import { QueryError } from '@/components/query-error'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const PAGE_SIZE = 20

function positivePage(value: string | null): number {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

function RecordStatus({ status }: { status: DnsRecord['status'] }) {
  if (status === 'enabled') return <Badge>启用</Badge>
  if (status === 'disabled') return <Badge variant="secondary">暂停</Badge>
  return <Badge variant="outline">未知</Badge>
}

function recordValue(record: DnsRecord): string {
  return `${record.value}${record.type === 'MX' && record.mxPriority !== undefined ? ` · 优先级 ${record.mxPriority}` : ''}`
}

function LoadingRows() {
  return Array.from({ length: 7 }, (_, index) => (
    <TableRow key={index}>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-5 w-12" /></TableCell>
      <TableCell><Skeleton className="h-4 w-64" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
      <TableCell><Skeleton className="h-5 w-12" /></TableCell>
    </TableRow>
  ))
}

function LoadingCards() {
  return Array.from({ length: 3 }, (_, index) => (
    <Card key={index} size="sm">
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </CardContent>
    </Card>
  ))
}

function RecordsContent({ domainId }: { domainId: number }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = positivePage(searchParams.get('page'))
  const queryText = searchParams.get('q') ?? ''
  const [copiedId, setCopiedId] = useState<string>()

  const domainQuery = useQuery({
    queryKey: ['domain', domainId],
    queryFn: async () => (await apiGet<DataResponse<DomainSummary>>(`/api/web/v1/domains/${domainId}`)).data,
    staleTime: 60_000,
  })
  const recordsQuery = useQuery({
    queryKey: ['records', domainId, { page, queryText }],
    queryFn: () => {
      const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      if (queryText) query.set('q', queryText)
      return apiGet<PageResponse<DnsRecord>>(`/api/web/v1/domains/${domainId}/records`, query)
    },
    placeholderData: (previous) => previous,
  })

  function setPage(nextPage: number) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('page', String(nextPage))
      return next
    })
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      const value = String(new FormData(event.currentTarget).get('q') ?? '').trim()
      if (value) next.set('q', value)
      else next.delete('q')
      next.set('page', '1')
      return next
    })
  }

  async function copyValue(record: DnsRecord) {
    await navigator.clipboard.writeText(record.value)
    setCopiedId(record.id)
    window.setTimeout(() => setCopiedId((current) => current === record.id ? undefined : current), 1_500)
  }

  const domainName = domainQuery.data?.name ?? `域名 #${domainId}`
  const records = recordsQuery.data?.data ?? []
  const isEmpty = recordsQuery.isSuccess && records.length === 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="DNS Records"
        title={domainQuery.isPending ? '正在读取域名…' : domainName}
        description="查看该域名在上游 DNS 平台中的解析记录。当前界面不会执行新增、修改或删除。"
        action={(
          <Button variant="outline" nativeButton={false} render={<Link to="/domains" />}>
            <ArrowLeftIcon data-icon="inline-start" />
            返回域名
          </Button>
        )}
      />

      {domainQuery.isError ? <QueryError error={domainQuery.error} retry={() => void domainQuery.refetch()} /> : null}
      {recordsQuery.isError ? <QueryError error={recordsQuery.error} retry={() => void recordsQuery.refetch()} /> : null}

      <Card className="gap-0 py-0">
        <CardHeader className="py-4">
          <form key={queryText} onSubmit={submitSearch}>
            <FieldGroup className="max-w-xl">
              <Field>
                <FieldLabel htmlFor="record-search" className="sr-only">搜索解析记录</FieldLabel>
                <InputGroup>
                  <InputGroupAddon><SearchIcon /></InputGroupAddon>
                  <InputGroupInput
                    id="record-search"
                    name="q"
                    defaultValue={queryText}
                    placeholder="搜索主机记录、记录值或备注"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton type="submit" variant="secondary">搜索</InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            </FieldGroup>
          </form>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {isEmpty ? (
            <Empty className="min-h-56">
              <EmptyHeader>
                <EmptyMedia variant="icon"><SearchXIcon /></EmptyMedia>
                <EmptyTitle>没有找到解析记录</EmptyTitle>
                <EmptyDescription>
                  {queryText ? `没有与“${queryText}”匹配的记录，请尝试其他关键词。` : '该域名当前没有可显示的解析记录。'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="pl-4">主机记录</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>记录值</TableHead>
                      <TableHead>线路</TableHead>
                      <TableHead className="text-right">TTL</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recordsQuery.isPending ? <LoadingRows /> : null}
                    {records.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="pl-4 font-mono font-medium">{record.name}</TableCell>
                        <TableCell><Badge variant="outline">{record.type}</Badge></TableCell>
                        <TableCell className="max-w-[34rem] whitespace-normal">
                          <div className="flex min-w-52 items-center gap-1.5">
                            <code className="min-w-0 flex-1 break-all text-xs leading-5">{recordValue(record)}</code>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              aria-label="复制记录值"
                              title={copiedId === record.id ? '已复制' : '复制记录值'}
                              onClick={() => void copyValue(record)}
                            >
                              {copiedId === record.id
                                ? <CheckIcon data-icon="inline-start" />
                                : <CopyIcon data-icon="inline-start" />}
                            </Button>
                          </div>
                          {record.remark ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{record.remark}</p> : null}
                        </TableCell>
                        <TableCell>{record.line.label}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{record.ttl ?? '—'}</TableCell>
                        <TableCell><RecordStatus status={record.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-3 p-3 md:hidden">
                {recordsQuery.isPending ? <LoadingCards /> : null}
                {records.map((record) => (
                  <Card key={record.id} size="sm">
                    <CardHeader>
                      <CardTitle>
                        <span className="flex items-center gap-2">
                          <code className="truncate">{record.name}</code>
                          <Badge variant="outline">{record.type}</Badge>
                        </span>
                      </CardTitle>
                      <CardDescription>{record.line.label} · TTL {record.ttl ?? '—'}</CardDescription>
                      <CardAction><RecordStatus status={record.status} /></CardAction>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <code className="break-all rounded-md bg-muted px-2 py-1.5 text-xs leading-5">{recordValue(record)}</code>
                      {record.remark ? <p className="text-xs text-muted-foreground">{record.remark}</p> : null}
                    </CardContent>
                    <CardFooter className="justify-end">
                      <Button size="sm" variant="outline" onClick={() => void copyValue(record)}>
                        {copiedId === record.id
                          ? <CheckIcon data-icon="inline-start" />
                          : <CopyIcon data-icon="inline-start" />}
                        {copiedId === record.id ? '已复制' : '复制记录值'}
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </>
          )}
          {recordsQuery.data ? <ListPagination meta={recordsQuery.data.meta} onPageChange={setPage} /> : null}
        </CardContent>
      </Card>
    </div>
  )
}

export function RecordsPage() {
  const { domainId: rawDomainId } = useParams()
  const domainId = Number(rawDomainId)
  if (!Number.isInteger(domainId) || domainId <= 0) return <Navigate to="/domains" replace />
  return <RecordsContent domainId={domainId} />
}
