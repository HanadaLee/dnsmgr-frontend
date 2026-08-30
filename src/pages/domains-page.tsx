import { useQuery } from '@tanstack/react-query'
import { ArrowRightIcon, Globe2Icon, SearchIcon, SearchXIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { apiGet } from '@/api/client'
import type { DomainSummary, PageResponse } from '@/api/types'
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

function dateOnly(value: string | undefined): string {
  return value ? value.slice(0, 10) : '—'
}

function ExpiryBadge({ domain, referenceTime }: { domain: DomainSummary; referenceTime: number }) {
  if (domain.expiryLookup === 'pending') return <Badge variant="outline">待查询</Badge>
  if (domain.expiryLookup === 'failed') return <Badge variant="destructive">查询失败</Badge>
  if (!domain.expiresAt) return <span className="text-muted-foreground">—</span>

  const expiresAt = new Date(domain.expiresAt.replace(' ', 'T')).getTime()
  const days = Number.isFinite(expiresAt) ? Math.ceil((expiresAt - referenceTime) / 86_400_000) : undefined
  if (days !== undefined && days <= 0) return <Badge variant="destructive">已到期 · {dateOnly(domain.expiresAt)}</Badge>
  if (days !== undefined && days <= 30) {
    return <Badge variant="secondary">{days} 天 · {dateOnly(domain.expiresAt)}</Badge>
  }
  return <Badge variant="outline">{dateOnly(domain.expiresAt)}</Badge>
}

function LoadingRows() {
  return Array.from({ length: 6 }, (_, index) => (
    <TableRow key={index}>
      <TableCell><Skeleton className="h-4 w-36" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell><Skeleton className="ml-auto size-7" /></TableCell>
    </TableRow>
  ))
}

function LoadingCards() {
  return Array.from({ length: 3 }, (_, index) => (
    <Card key={index} size="sm">
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-4/5" />
      </CardContent>
    </Card>
  ))
}

export function DomainsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = positivePage(searchParams.get('page'))
  const queryText = searchParams.get('q') ?? ''
  const [referenceTime] = useState(() => Date.now())

  const domainsQuery = useQuery({
    queryKey: ['domains', { page, queryText }],
    queryFn: () => {
      const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      if (queryText) query.set('q', queryText)
      return apiGet<PageResponse<DomainSummary>>('/api/web/v1/domains', query)
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

  const domains = domainsQuery.data?.data ?? []
  const isEmpty = domainsQuery.isSuccess && domains.length === 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Domains"
        title="域名管理"
        description="数据实时读取自原 dnsmgr，并由 v1051 适配器转换为稳定字段。"
      />

      {domainsQuery.isError ? (
        <QueryError error={domainsQuery.error} retry={() => void domainsQuery.refetch()} />
      ) : null}

      <Card className="gap-0 py-0">
        <CardHeader className="py-4">
          <form key={queryText} onSubmit={submitSearch}>
            <FieldGroup className="max-w-xl">
              <Field>
                <FieldLabel htmlFor="domain-search" className="sr-only">搜索域名</FieldLabel>
                <InputGroup>
                  <InputGroupAddon><SearchIcon /></InputGroupAddon>
                  <InputGroupInput
                    id="domain-search"
                    name="q"
                    defaultValue={queryText}
                    placeholder="搜索域名或备注"
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
                <EmptyTitle>没有找到域名</EmptyTitle>
                <EmptyDescription>
                  {queryText ? `没有与“${queryText}”匹配的域名，请尝试其他关键词。` : '当前账户尚未返回可管理的域名。'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="pl-4">域名</TableHead>
                      <TableHead>平台账户</TableHead>
                      <TableHead className="text-right">记录数</TableHead>
                      <TableHead>到期时间</TableHead>
                      <TableHead className="hidden lg:table-cell">分类 / 备注</TableHead>
                      <TableHead className="w-14"><span className="sr-only">查看</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {domainsQuery.isPending ? <LoadingRows /> : null}
                    {domains.map((domain) => (
                      <TableRow key={domain.id}>
                        <TableCell className="pl-4 font-medium">
                          <Link className="inline-flex items-center gap-2 hover:text-primary" to={`/domains/${domain.id}`}>
                            <Globe2Icon className="size-4 text-primary" />
                            {domain.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-48">
                            <p className="truncate">{domain.provider.accountLabel ?? domain.provider.label}</p>
                            <p className="truncate text-xs text-muted-foreground">{domain.provider.type}{domain.provider.accountId ? ` · #${domain.provider.accountId}` : ''}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{domain.recordCount}</TableCell>
                        <TableCell><ExpiryBadge domain={domain} referenceTime={referenceTime} /></TableCell>
                        <TableCell className="hidden max-w-64 lg:table-cell">
                          <p className="truncate">{domain.category ?? '—'}</p>
                          {domain.remark ? <p className="truncate text-xs text-muted-foreground">{domain.remark}</p> : null}
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <Button size="icon-sm" variant="ghost" nativeButton={false} render={<Link to={`/domains/${domain.id}`} aria-label={`查看 ${domain.name} 的解析记录`} />}>
                            <ArrowRightIcon data-icon="inline-end" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-3 p-3 md:hidden">
                {domainsQuery.isPending ? <LoadingCards /> : null}
                {domains.map((domain) => (
                  <Card key={domain.id} size="sm">
                    <CardHeader>
                      <CardTitle>
                        <Link className="flex items-center gap-2" to={`/domains/${domain.id}`}>
                          <Globe2Icon className="size-4 text-primary" />
                          <span className="truncate">{domain.name}</span>
                        </Link>
                      </CardTitle>
                      <CardDescription>
                        {domain.provider.accountLabel ?? domain.provider.label} · {domain.provider.type}
                      </CardDescription>
                      <CardAction><Badge variant="secondary">{domain.recordCount} 条记录</Badge></CardAction>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">到期时间</span>
                        <ExpiryBadge domain={domain} referenceTime={referenceTime} />
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-muted-foreground">分类 / 备注</span>
                        <span className="max-w-48 text-right">{domain.remark ?? domain.category ?? '—'}</span>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button className="w-full" variant="outline" nativeButton={false} render={<Link to={`/domains/${domain.id}`} />}>
                        查看解析记录
                        <ArrowRightIcon data-icon="inline-end" />
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </>
          )}
          {domainsQuery.data ? <ListPagination meta={domainsQuery.data.meta} onPageChange={setPage} /> : null}
        </CardContent>
      </Card>
    </div>
  )
}
