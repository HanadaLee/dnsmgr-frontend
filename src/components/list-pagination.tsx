import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Fragment } from 'react'

import type { PageMeta } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination'
import { Separator } from '@/components/ui/separator'

export function ListPagination({ meta, onPageChange }: { meta: PageMeta; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(meta.total / meta.pageSize))
  const first = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1
  const last = Math.min(meta.page * meta.pageSize, meta.total)

  return (
    <Fragment>
      <Separator />
      <div className="flex flex-col gap-3 bg-muted/20 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          {meta.total === 0 ? '暂无数据' : `显示 ${first}–${last}，共 ${meta.total} 项`}
        </p>
        <Pagination className="mx-0 w-auto justify-start sm:justify-end">
          <PaginationContent>
            <PaginationItem>
              <span className="px-2 text-xs text-muted-foreground">第 {meta.page} / {totalPages} 页</span>
            </PaginationItem>
            <PaginationItem>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="上一页"
                disabled={meta.page <= 1}
                onClick={() => onPageChange(meta.page - 1)}
              >
                <ChevronLeftIcon data-icon="inline-start" />
              </Button>
            </PaginationItem>
            <PaginationItem>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="下一页"
                disabled={meta.page >= totalPages || meta.total === 0}
                onClick={() => onPageChange(meta.page + 1)}
              >
                <ChevronRightIcon data-icon="inline-end" />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </Fragment>
  )
}
