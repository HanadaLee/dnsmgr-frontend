import { useState } from 'react'
import { ListChecksIcon } from 'lucide-react'

import type { DomainSummary } from '@/api/types'
import { BatchPagedTable, BatchSelect } from '@/components/batch-operations/common'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { selectedDomains, type DomainSelection } from '@/lib/batch-operations'

export function DomainScope({
  domains,
  value,
  onChange,
  disabled = false,
}: {
  domains: DomainSummary[]
  value: DomainSelection
  onChange: (value: DomainSelection) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [picked, setPicked] = useState(new Set<string>())
  const resolved = selectedDomains(value, domains)
  const groups = [
    ...new Map(domains.map((domain) => [String(domain.categoryId ?? 0), domain.category ?? '未分组'])).entries(),
  ]
  const matching = domains.filter((domain) =>
    `${domain.name} ${domain.provider.label} ${domain.provider.accountLabel ?? ''}`
      .toLowerCase()
      .includes(keyword.trim().toLowerCase()),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>选择域名</CardTitle>
        <CardDescription>明确本次操作范围；同名域名在不同 DNS 账户中分别选择。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          <Field data-disabled={disabled}>
            <FieldLabel id="batch-domain-scope-label">域名范围</FieldLabel>
            <ToggleGroup
              aria-labelledby="batch-domain-scope-label"
              variant="outline"
              spacing={0}
              value={[value.mode]}
              disabled={disabled}
              onValueChange={(next) => {
                const mode = next[0]
                if (mode === 'specified' || mode === 'group' || mode === 'all') onChange({ ...value, mode })
              }}
            >
              <ToggleGroupItem value="specified">指定域名</ToggleGroupItem>
              <ToggleGroupItem value="group">指定分组</ToggleGroupItem>
              <ToggleGroupItem value="all">全部域名</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          {value.mode === 'specified' ? (
            <Field data-disabled={disabled}>
              <FieldLabel className="sr-only" htmlFor="batch-domain-names">
                域名列表
              </FieldLabel>
              <Textarea
                id="batch-domain-names"
                rows={4}
                value={value.text}
                disabled={disabled}
                onChange={(event) => onChange({ ...value, text: event.target.value, explicitIds: undefined })}
                placeholder={'example.com\nexample.net'}
              />
              <FieldDescription>每行一个域名，也支持逗号分隔。仅操作已托管的域名，最多 {5000} 个。</FieldDescription>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  setPicked(new Set(resolved.domains.map((domain) => String(domain.id))))
                  setOpen(true)
                }}
              >
                <ListChecksIcon data-icon="inline-start" />
                从域名列表中选择
              </Button>
            </Field>
          ) : null}
          {value.mode === 'group' ? (
            <Field data-disabled={disabled}>
              <FieldLabel>域名分组</FieldLabel>
              <BatchSelect
                label="域名分组"
                value={value.group}
                items={[
                  { value: '', label: '请选择分组' },
                  ...groups.map(([group, label]) => ({ value: group, label })),
                ]}
                onChange={(group) => onChange({ ...value, group })}
                disabled={disabled}
              />
            </Field>
          ) : null}
        </FieldGroup>
        <p className="text-sm text-muted-foreground">
          本次选择 {resolved.domains.length} 个域名 / DNS 账户组合
          {value.mode === 'all' ? '，包括所有账户，请在执行前核对预览。' : '。'}
        </p>
        {resolved.errors.length ? (
          <Alert variant="destructive">
            <AlertDescription>
              {resolved.errors.slice(0, 6).join('；')}
              {resolved.errors.length > 6 ? `；另有 ${resolved.errors.length - 6} 个问题` : ''}
            </AlertDescription>
          </Alert>
        ) : null}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>选择托管域名</DialogTitle>
              <DialogDescription>每一行对应明确的 DNS 账户；不会自动选中同名域名的其他账户。</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="batch-domain-picker-search">搜索域名或账户</FieldLabel>
              <Input
                id="batch-domain-picker-search"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </Field>
            <p className="text-sm text-muted-foreground">
              已选择 {picked.size} 项，当前匹配 {matching.length} 项
            </p>
            <BatchPagedTable
              key={keyword}
              rows={matching}
              selected={picked}
              onSelectedChange={setPicked}
              rowKey={(domain) => String(domain.id)}
              columns={[
                { key: 'domain', label: '域名', render: (domain) => domain.name },
                {
                  key: 'account',
                  label: 'DNS 账户',
                  render: (domain) =>
                    `${domain.provider.label} · ${domain.provider.accountLabel ?? `#${domain.provider.accountId ?? domain.id}`}`,
                },
                { key: 'group', label: '分组', render: (domain) => domain.category ?? '未分组' },
              ]}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const chosen = domains.filter((domain) => picked.has(String(domain.id)))
                  onChange({
                    ...value,
                    mode: 'specified',
                    text: [...new Set(chosen.map((domain) => domain.name))].join('\n'),
                    explicitIds: chosen.map((domain) => domain.id),
                  })
                  setOpen(false)
                }}
              >
                确认选择 {picked.size} 项
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
