import type { ReactNode } from 'react'
import { DatabaseIcon } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export type DataColumn<T> = {
  key: string
  label: string
  className?: string
  render: (row: T) => ReactNode
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  selected,
  onSelectedChange,
  isRowSelectable,
  emptyTitle = '暂无数据',
  emptyDescription = '调整筛选条件或新增一条数据。',
}: {
  rows: T[]
  columns: DataColumn<T>[]
  rowKey: (row: T) => string
  selected?: Set<string>
  onSelectedChange?: (selected: Set<string>) => void
  isRowSelectable?: (row: T) => boolean
  emptyTitle?: string
  emptyDescription?: string
}) {
  const selectable = Boolean(selected && onSelectedChange)
  const keys = rows.filter((row) => isRowSelectable?.(row) ?? true).map(rowKey)
  const allSelected = keys.length > 0 && keys.every((key) => selected?.has(key))

  if (!rows.length) {
    return (
      <Empty className="py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon"><DatabaseIcon /></EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {selectable ? (
              <TableHead className="w-10">
                <Checkbox
                  aria-label="选择当前页全部项目"
                  checked={allSelected}
                  onCheckedChange={(checked) => {
                    const next = new Set(selected)
                    keys.forEach((key) => checked ? next.add(key) : next.delete(key))
                    onSelectedChange?.(next)
                  }}
                />
              </TableHead>
            ) : null}
            {columns.map((column) => <TableHead key={column.key} className={column.className}>{column.label}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const key = rowKey(row)
            const rowSelectable = isRowSelectable?.(row) ?? true
            return (
              <TableRow key={key} data-state={selected?.has(key) ? 'selected' : undefined}>
                {selectable ? (
                  <TableCell>
                    <Checkbox
                      aria-label="选择项目"
                      checked={selected?.has(key) ?? false}
                      disabled={!rowSelectable}
                      onCheckedChange={(checked) => {
                        const next = new Set(selected)
                        if (checked) next.add(key)
                        else next.delete(key)
                        onSelectedChange?.(next)
                      }}
                    />
                  </TableCell>
                ) : null}
                {columns.map((column) => <TableCell key={column.key} className={column.className}>{column.render(row)}</TableCell>)}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
