import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useState } from 'react'
import { DataTable, type DataColumn } from '@/components/data-table'
import { ListPagination } from '@/components/list-pagination'

export function BatchPagedTable<T>({
  rows,
  columns,
  rowKey,
  selected,
  onSelectedChange,
  emptyTitle,
  isRowSelectable,
}: {
  rows: T[]
  columns: DataColumn<T>[]
  rowKey: (row: T) => string
  selected?: Set<string>
  onSelectedChange?: (selected: Set<string>) => void
  emptyTitle?: string
  isRowSelectable?: (row: T) => boolean
}) {
  const [page, setPage] = useState(1)
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / 50)))
  return (
    <div className="flex flex-col gap-3">
      <DataTable
        rows={rows.slice((current - 1) * 50, current * 50)}
        columns={columns}
        rowKey={rowKey}
        selected={selected}
        onSelectedChange={onSelectedChange}
        emptyTitle={emptyTitle}
        isRowSelectable={isRowSelectable}
      />
      {rows.length > 50 ? (
        <ListPagination meta={{ page: current, pageSize: 50, total: rows.length }} onPageChange={setPage} />
      ) : null}
    </div>
  )
}

export function BatchSelect({
  value,
  items,
  onChange,
  disabled,
  label,
}: {
  value: string
  items: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  disabled?: boolean
  label: string
}) {
  return (
    <Select
      items={items}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) onChange(next)
      }}
    >
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
