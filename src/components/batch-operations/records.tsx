import { useRef, useState } from 'react'
import { DownloadIcon, SearchIcon, SquareIcon } from 'lucide-react'

import { apiGet } from '@/api/client'
import type { DataResponse, DomainSummary, RecordOptions } from '@/api/types'
import { BatchPagedTable, BatchSelect } from '@/components/batch-operations/common'
import { BatchSubmit, type BatchComplete } from '@/components/batch-operations/submit'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import {
  RECORD_TYPES,
  applyRecordChanges,
  deleteRecordPlan,
  draftFromRecord,
  recordDraftChanged,
  recordUpdatePlans,
  type RecordChanges,
  type RecordDraft,
} from '@/lib/batch-operations'
import { downloadSheet, RECORD_HEADERS } from '@/lib/batch-files'
import { recordValueForDisplay } from '@/lib/dns-record-value'
import { queryDomainRecords, type GlobalRecord, type RecordFilters } from '@/lib/record-search'

type RecordTask = 'modify-record' | 'delete-record' | 'export-record'
const fieldLabels = {
  name: '主机记录',
  type: '记录类型',
  line: '线路',
  ttl: 'TTL',
  mxPriority: 'MX 优先级',
  weight: '权重',
  remark: '备注',
} as const

export function BatchRecords({
  task,
  domains,
  disabled,
  busy,
  onBusyChange,
  onComplete,
}: {
  task: RecordTask
  domains: DomainSummary[]
  disabled: boolean
  busy: boolean
  onBusyChange: (busy: boolean) => void
  onComplete: BatchComplete
}) {
  const [filters, setFilters] = useState<RecordFilters>({ valueMode: 'contains' })
  const [records, setRecords] = useState<GlobalRecord[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<Record<string, RecordDraft>>({})
  const [options, setOptions] = useState<Map<number, RecordOptions>>(new Map())
  const [queried, setQueried] = useState(false)
  const [querying, setQuerying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [failures, setFailures] = useState<string[]>([])
  const [queryNote, setQueryNote] = useState('')
  const [changes, setChanges] = useState<RecordChanges>({})
  const [valueMode, setValueMode] = useState('keep')
  const [uniformValue, setUniformValue] = useState('')
  const [find, setFind] = useState('')
  const [replacement, setReplacement] = useState('')
  const stop = useRef(false)
  const picked = records.filter((record) => selected.has(record.key))
  const changed = picked.filter((record) => recordDraftChanged(record, drafts[record.key] ?? draftFromRecord(record)))

  function changeFilter(change: Partial<RecordFilters>) {
    setFilters((current) => ({ ...current, ...change }))
    setRecords([])
    setSelected(new Set())
    setDrafts({})
    setQueried(false)
    setFailures([])
    setQueryNote('')
  }

  async function query() {
    if (disabled || !domains.length) return
    setQuerying(true)
    onBusyChange(true)
    stop.current = false
    setRecords([])
    setSelected(new Set())
    setDrafts({})
    setFailures([])
    setQueryNote('')
    setProgress(0)
    setQueried(true)
    const next: GlobalRecord[] = []
    const failed: string[] = []
    const loadedOptions = new Map<number, RecordOptions>()
    let completed = 0
    try {
      for (const domain of domains) {
        if (stop.current) break
        try {
          if (task === 'modify-record')
            loadedOptions.set(
              domain.id,
              (await apiGet<DataResponse<RecordOptions>>(`/api/web/v1/domains/${domain.id}/record-options`)).data,
            )
          next.push(...(await queryDomainRecords(domain, filters, () => stop.current)))
        } catch (error) {
          failed.push(
            `${domain.name}（${domain.provider.accountLabel ?? domain.provider.label}）：${error instanceof Error ? error.message : '查询失败'}`,
          )
        }
        completed += 1
        setRecords([...next])
        setFailures([...failed])
        setProgress(completed)
        setOptions(new Map(loadedOptions))
      }
      if (stop.current) setQueryNote('查询已停止，当前仅显示已获取的部分结果；不会自动勾选任何记录。')
    } finally {
      setQuerying(false)
      onBusyChange(false)
    }
  }

  function update(record: GlobalRecord, change: Partial<RecordDraft>) {
    setDrafts((current) => ({
      ...current,
      [record.key]: { ...(current[record.key] ?? draftFromRecord(record)), ...change },
    }))
  }

  function applyCommon() {
    if (!picked.length) return
    if (valueMode === 'replace' && !find) {
      toast.add({ title: '请填写要查找的内容', type: 'warning' })
      return
    }
    const fields = { ...changes, ...(valueMode === 'set' ? { value: uniformValue } : {}) }
    setDrafts((current) => {
      const next = { ...current }
      for (const record of picked)
        next[record.key] = applyRecordChanges(
          next[record.key] ?? draftFromRecord(record),
          fields,
          valueMode === 'replace' ? { find, value: replacement } : undefined,
        )
      return next
    })
    toast.add({
      title: `已填入 ${picked.length} 条记录的编辑表格`,
      description: '尚未写入 DNS，请逐条核对后预览执行。',
      type: 'success',
    })
  }

  async function exportRecords() {
    try {
      const rows = picked.length ? picked : records
      await downloadSheet(
        '解析记录',
        [...RECORD_HEADERS, '记录 ID', 'DNS 账户', '状态'],
        rows.map((record) => {
          const draft = draftFromRecord(record)
          const domain = domains.find((item) => item.id === record.domainId)
          return [
            record.domainId,
            record.domainName,
            draft.name,
            draft.type,
            draft.value,
            draft.line,
            draft.ttl,
            draft.mxPriority,
            draft.weight,
            draft.remark,
            record.id,
            domain?.provider.accountLabel ?? record.provider,
            record.status,
          ]
        }),
      )
    } catch (error) {
      toast.add({
        title: '导出失败',
        description: error instanceof Error ? error.message : '无法生成文件',
        type: 'error',
      })
    }
  }

  function prepare() {
    if (disabled) throw new Error('请先修正域名范围')
    if (task === 'delete-record') return picked.map(deleteRecordPlan)
    return changed.flatMap((record) => {
      const domain = domains.find((item) => item.id === record.domainId)
      const option = options.get(record.domainId)
      if (!domain || !option) throw new Error(`未取得 ${record.domainName} 的记录选项，请重新查询`)
      return recordUpdatePlans(domain, drafts[record.key], option, record)
    })
  }

  const editable = (record: GlobalRecord) => task === 'modify-record' && selected.has(record.key) && !busy
  const cell = (record: GlobalRecord, field: keyof Omit<RecordDraft, 'key'>, type = 'text') => {
    const draft = drafts[record.key] ?? draftFromRecord(record)
    const label = field === 'value' ? '记录值' : fieldLabels[field as keyof typeof fieldLabels]
    if (!editable(record))
      return (
        <span className="block max-w-80 break-all whitespace-normal">
          {field === 'line' ? record.line.label : draft[field] || '—'}
        </span>
      )
    if (field === 'type' || field === 'line') {
      const option = options.get(record.domainId)
      const items =
        field === 'type'
          ? (option?.recordTypes ?? RECORD_TYPES).map((value) => ({ value, label: value }))
          : (option?.lines.map((line) => ({ value: line.id, label: line.label })) ?? [
              { value: record.line.id, label: record.line.label },
            ])
      return (
        <div className="min-w-32">
          <BatchSelect
            value={draft[field]}
            items={items}
            label={`${record.domainName} ${record.name} ${label}`}
            onChange={(value) => update(record, { [field]: value })}
          />
        </div>
      )
    }
    if (field === 'value' || field === 'remark')
      return (
        <Textarea
          aria-label={`${record.domainName} ${record.name} ${label}`}
          className="min-h-8 min-w-64 resize-y"
          rows={1}
          value={draft[field]}
          onChange={(event) => update(record, { [field]: event.target.value })}
        />
      )
    return (
      <Input
        aria-label={`${record.domainName} ${record.name} ${label}`}
        className="min-w-24"
        type={type}
        value={draft[field]}
        onChange={(event) => update(record, { [field]: event.target.value })}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>2. 选择记录</CardTitle>
          <CardDescription>
            按所选域名查询记录，条件均可留空。记录值支持包含匹配，不需要输入完整 IP 或域名。
            {task === 'modify-record' ? '可以只查询、不修改；查询不会更改解析，勾选记录后才可编辑，并需预览确认后执行。' : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="batch-record-type">记录类型</FieldLabel>
              <BatchSelect
                label="筛选记录类型"
                value={filters.type || 'all'}
                items={[{ value: 'all', label: '全部类型' }, ...RECORD_TYPES.map((value) => ({ value, label: value }))]}
                disabled={busy}
                onChange={(type) => changeFilter({ type: type === 'all' ? '' : type })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="batch-record-name">主机记录</FieldLabel>
              <Input
                id="batch-record-name"
                placeholder="留空表示全部主机记录"
                value={filters.name ?? ''}
                disabled={busy}
                onChange={(event) => changeFilter({ name: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="batch-record-line">线路</FieldLabel>
              <Input
                id="batch-record-line"
                placeholder="线路名称或 ID，可留空"
                value={filters.line ?? ''}
                disabled={busy}
                onChange={(event) => changeFilter({ line: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="batch-record-value">记录值</FieldLabel>
              <Input
                id="batch-record-value"
                placeholder="例如 192.0.2 或 edge.example，可留空"
                value={filters.value ?? ''}
                disabled={busy}
                onChange={(event) => changeFilter({ value: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>记录值匹配方式</FieldLabel>
              <BatchSelect
                label="记录值匹配方式"
                value={filters.valueMode ?? 'contains'}
                items={[
                  { value: 'contains', label: '模糊匹配（包含）' },
                  { value: 'exact', label: '精确匹配' },
                ]}
                disabled={busy}
                onChange={(value) => changeFilter({ valueMode: value as RecordFilters['valueMode'] })}
              />
            </Field>
            <Field>
              <FieldLabel>生效状态</FieldLabel>
              <BatchSelect
                label="筛选生效状态"
                value={filters.status || 'all'}
                items={[
                  { value: 'all', label: '全部状态' },
                  { value: 'enabled', label: '启用' },
                  { value: 'disabled', label: '停用' },
                  { value: 'unknown', label: '未知' },
                ]}
                disabled={busy}
                onChange={(status) => changeFilter({ status: status === 'all' ? '' : status })}
              />
            </Field>
          </FieldGroup>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={disabled || busy || !domains.length} onClick={() => void query()}>
              {querying ? <Spinner data-icon="inline-start" /> : <SearchIcon data-icon="inline-start" />}查询记录
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                changeFilter({ name: '', type: '', line: '', value: '', valueMode: 'contains', status: '' })
              }
            >
              重置条件
            </Button>
            {querying ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  stop.current = true
                }}
              >
                <SquareIcon data-icon="inline-start" />
                停止查询
              </Button>
            ) : null}
          </div>
          {querying ? (
            <>
              <Progress value={(100 * progress) / Math.max(1, domains.length)} />
              <p className="text-sm text-muted-foreground">
                已查询 {progress} / {domains.length} 个域名 / 账户，已找到 {records.length} 条记录
              </p>
            </>
          ) : null}
          {failures.length ? (
            <Alert variant="destructive">
              <AlertDescription>
                {failures.length} 个域名查询失败，结果不完整：{failures.slice(0, 6).join('；')}
              </AlertDescription>
            </Alert>
          ) : null}
          {queryNote ? (
            <Alert>
              <AlertDescription>{queryNote}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
      {task === 'modify-record' && records.length ? (
        <Card>
          <CardHeader>
            <CardTitle>3. 修改记录</CardTitle>
            <CardDescription>
              勾选记录后直接在下表逐条编辑，各条记录可以使用不同的值。未修改的字段保持原值，未勾选的记录不会执行。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer text-sm font-medium">可选：给所选记录批量填入字段 / 查找替换</summary>
              <div className="mt-4 flex flex-col gap-4">
                <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(fieldLabels).map(([key, label]) => (
                    <Field key={key}>
                      <FieldLabel className="flex items-center gap-2">
                        <Checkbox
                          checked={key in changes}
                          disabled={busy}
                          onCheckedChange={(checked) =>
                            setChanges((current) => {
                              const next = { ...current }
                              if (checked) next[key as keyof RecordChanges] = ''
                              else delete next[key as keyof RecordChanges]
                              return next
                            })
                          }
                        />
                        {label} · {key in changes ? '修改为' : '不修改'}
                      </FieldLabel>
                      {key in changes ? (
                        <Input
                          aria-label={`批量填入${label}`}
                          disabled={busy}
                          value={changes[key as keyof RecordChanges] ?? ''}
                          onChange={(event) => setChanges((current) => ({ ...current, [key]: event.target.value }))}
                        />
                      ) : null}
                    </Field>
                  ))}
                  <Field>
                    <FieldLabel>记录值</FieldLabel>
                    <BatchSelect
                      label="批量填入记录值"
                      value={valueMode}
                      items={[
                        { value: 'keep', label: '不修改' },
                        { value: 'set', label: '统一修改为' },
                        { value: 'replace', label: '查找并替换部分内容' },
                      ]}
                      disabled={busy}
                      onChange={setValueMode}
                    />
                  </Field>
                  {valueMode === 'set' ? (
                    <Field>
                      <FieldLabel htmlFor="batch-uniform-value">新的记录值</FieldLabel>
                      <Input
                        id="batch-uniform-value"
                        value={uniformValue}
                        disabled={busy}
                        onChange={(event) => setUniformValue(event.target.value)}
                      />
                    </Field>
                  ) : null}
                  {valueMode === 'replace' ? (
                    <>
                      <Field>
                        <FieldLabel htmlFor="batch-find-value">查找内容（原文，不是正则）</FieldLabel>
                        <Input
                          id="batch-find-value"
                          value={find}
                          disabled={busy}
                          onChange={(event) => setFind(event.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="batch-replacement-value">替换为（可为空）</FieldLabel>
                        <Input
                          id="batch-replacement-value"
                          value={replacement}
                          disabled={busy}
                          onChange={(event) => setReplacement(event.target.value)}
                        />
                      </Field>
                    </>
                  ) : null}
                </FieldGroup>
                <Button
                  type="button"
                  variant="outline"
                  className="self-start"
                  disabled={busy || !picked.length}
                  onClick={applyCommon}
                >
                  填入所选 {picked.length} 条记录（不提交）
                </Button>
              </div>
            </details>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{queried ? `查询结果 · ${records.length} 条` : '查询结果'}</CardTitle>
          <CardDescription>
            {queried
              ? `已选择 ${picked.length} 条${task === 'modify-record' ? `，其中 ${changed.length} 条有修改` : ''}。`
              : '选择域名并设置筛选条件后查询；结果不会自动勾选。'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {records.length ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setSelected(new Set(records.map((record) => record.key)))}
              >
                选择全部查询结果（{records.length} 条）
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !selected.size}
                onClick={() => setSelected(new Set())}
              >
                取消选择
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void exportRecords()}>
                <DownloadIcon data-icon="inline-start" />
                导出{picked.length ? `所选 ${picked.length} 条` : `查询结果 ${records.length} 条`}
              </Button>
            </div>
          ) : null}
          <BatchPagedTable
            rows={records}
            rowKey={(record) => record.key}
            selected={selected}
            onSelectedChange={busy ? undefined : setSelected}
            emptyTitle={queried ? '没有符合条件的记录' : '尚未查询'}
            columns={[
              {
                key: 'domain',
                label: '域名 / DNS 账户',
                render: (record) => (
                  <div className="min-w-40">
                    {record.domainName}
                    <p className="text-xs text-muted-foreground">
                      {domains.find((domain) => domain.id === record.domainId)?.provider.accountLabel ??
                        record.provider}
                    </p>
                  </div>
                ),
              },
              { key: 'name', label: '主机记录', render: (record) => cell(record, 'name') },
              { key: 'type', label: '类型', render: (record) => cell(record, 'type') },
              {
                key: 'value',
                label: task === 'modify-record' ? '记录值（逐条编辑）' : '记录值',
                render: (record) => cell(record, 'value'),
              },
              ...(task === 'modify-record'
                ? [
                    {
                      key: 'before',
                      label: '原记录值',
                      render: (record: GlobalRecord) => (
                        <span className="block max-w-72 break-all whitespace-normal text-muted-foreground">
                          {recordValueForDisplay(record.providerType, record.type, record.value)}
                        </span>
                      ),
                    },
                  ]
                : []),
              { key: 'line', label: '线路', render: (record) => cell(record, 'line') },
              { key: 'ttl', label: 'TTL', render: (record) => cell(record, 'ttl', 'number') },
              { key: 'mx', label: 'MX 优先级', render: (record) => cell(record, 'mxPriority', 'number') },
              { key: 'weight', label: '权重', render: (record) => cell(record, 'weight', 'number') },
              { key: 'remark', label: '备注', render: (record) => cell(record, 'remark') },
              {
                key: 'status',
                label: '状态',
                render: (record) => ({ enabled: '启用', disabled: '停用', unknown: '未知' })[record.status],
              },
            ]}
          />
          {task === 'modify-record' || task === 'delete-record' ? (
            <BatchSubmit
              label={task === 'modify-record' ? '修改记录' : '删除记录'}
              prepare={prepare}
              destructive={task === 'delete-record'}
              busy={busy}
              disabled={disabled || !(task === 'modify-record' ? changed.length : picked.length)}
              onBusyChange={onBusyChange}
              onComplete={(label, results) => {
                setRecords([])
                setDrafts({})
                setSelected(new Set())
                setQueryNote('本次执行已结束，请重新查询以取得最新记录。逐项结果保留在下方。')
                onComplete(label, results)
              }}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
