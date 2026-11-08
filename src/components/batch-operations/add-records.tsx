import { useRef, useState } from 'react'
import { PlusIcon, Trash2Icon, DownloadIcon, UploadIcon } from 'lucide-react'

import { apiGet } from '@/api/client'
import type { DataResponse, DomainSummary, RecordOptions } from '@/api/types'
import { BatchPagedTable, BatchSelect } from '@/components/batch-operations/common'
import { BatchSubmit, type BatchComplete } from '@/components/batch-operations/submit'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { BATCH_LIMIT, RECORD_TYPES, emptyRecordDraft, recordPlan, type RecordDraft } from '@/lib/batch-operations'
import { downloadSheet, importTargets, readRecordFile, RECORD_HEADERS, type ImportedRecord } from '@/lib/batch-files'

export function AddRecords({
  domains,
  importMode,
  disabled,
  busy,
  onBusyChange,
  onComplete,
}: {
  domains: DomainSummary[]
  importMode: boolean
  disabled: boolean
  busy: boolean
  onBusyChange: (busy: boolean) => void
  onComplete: BatchComplete
}) {
  const [rows, setRows] = useState<ImportedRecord[]>(
    importMode ? [] : [{ domain: '', draft: emptyRecordDraft('row-1') }],
  )
  const [submitted, setSubmitted] = useState(false)
  const [submittedScope, setSubmittedScope] = useState('')
  const [fileName, setFileName] = useState('')
  const sequence = useRef(1)
  const fileInput = useRef<HTMLInputElement>(null)
  const count = importMode ? rows.length : rows.length * domains.length
  const scope = domains
    .map((domain) => domain.id)
    .sort((a, b) => a - b)
    .join(',')
  const alreadySubmitted = submitted && submittedScope === scope

  function update(key: string, changes: Partial<RecordDraft>) {
    setSubmitted(false)
    setRows((current) =>
      current.map((row) => (row.draft.key === key ? { ...row, draft: { ...row.draft, ...changes } } : row)),
    )
  }

  async function loadFile(file: File) {
    onBusyChange(true)
    try {
      setRows(await readRecordFile(file))
      setSubmitted(false)
      setFileName(file.name)
    } catch (error) {
      toast.add({
        title: '无法导入文件',
        description: error instanceof Error ? error.message : '文件无法识别',
        type: 'error',
      })
    } finally {
      onBusyChange(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function prepare() {
    if (disabled || !domains.length) throw new Error('请先选择有效的域名范围')
    if (count > BATCH_LIMIT) throw new Error(`展开后共 ${count} 项，单次最多 ${BATCH_LIMIT} 项`)
    const options = new Map<number, RecordOptions>()
    const plannedRows = rows.flatMap((row) =>
      (importMode ? importTargets(row, domains) : domains).map((domain) => ({ row, domain })),
    )
    for (const { domain } of plannedRows) {
      if (!options.has(domain.id))
        options.set(
          domain.id,
          (await apiGet<DataResponse<RecordOptions>>(`/api/web/v1/domains/${domain.id}/record-options`)).data,
        )
    }
    return plannedRows.map(({ row, domain }) => recordPlan(domain, row.draft, options.get(domain.id)!))
  }

  const editable = !busy
  const input = (row: ImportedRecord, field: keyof Omit<RecordDraft, 'key'>, label: string, type = 'text') =>
    field === 'value' || field === 'remark' ? (
      <Textarea
        aria-label={`${row.draft.name || '新记录'} ${label}`}
        className="min-h-8 min-w-64 resize-y"
        rows={1}
        value={row.draft[field]}
        disabled={!editable}
        onChange={(event) => update(row.draft.key, { [field]: event.target.value })}
      />
    ) : (
      <Input
        aria-label={`${row.draft.name || '新记录'} ${label}`}
        className="min-w-24"
        type={type}
        value={row.draft[field]}
        disabled={!editable}
        onChange={(event) => update(row.draft.key, { [field]: event.target.value })}
      />
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. {importMode ? '导入记录' : '填写记录'}</CardTitle>
        <CardDescription>
          {importMode
            ? '使用模板文件，每行分别指定域名和记录值。域名 ID 可区分同名域名的不同 DNS 账户。'
            : '每行是一条独立记录，可以填写不同的主机记录、类型和值。这里的记录会分别添加到上方所选的每个域名。'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {importMode ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void downloadSheet('记录导入模板', RECORD_HEADERS, [
                    [
                      domains.length === 1 ? domains[0].id : '',
                      domains.length === 1 ? domains[0].name : 'example.com',
                      'www',
                      'A',
                      '192.0.2.1',
                      '',
                      '600',
                      '10',
                      '0',
                      '',
                    ],
                  ]).catch(() => toast.add({ title: '模板下载失败', type: 'error' }))
                }
              >
                <DownloadIcon data-icon="inline-start" />
                下载模板
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
                <UploadIcon data-icon="inline-start" />
                选择文件
              </Button>
              <Input
                ref={fileInput}
                aria-label="记录导入文件"
                className="sr-only"
                type="file"
                accept=".xlsx,.xls,.csv,.tsv"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void loadFile(file)
                }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {fileName || '支持 XLSX、XLS、UTF-8 CSV / TSV，最多 5000 行、10 MB。选择文件只加载预览，不会写入 DNS。'}
            </p>
          </>
        ) : null}
        {count > BATCH_LIMIT ? (
          <Alert variant="destructive">
            <AlertDescription>
              展开后共 {count} 项，超过单次 {BATCH_LIMIT} 项限制，请缩小范围。
            </AlertDescription>
          </Alert>
        ) : null}
        <BatchPagedTable
          rows={rows}
          emptyTitle="选择文件后在这里逐条核对记录"
          rowKey={(row) => row.draft.key}
          columns={[
            ...(importMode
              ? [
                  {
                    key: 'domain',
                    label: '目标域名 / 域名 ID',
                    render: (row: ImportedRecord) => (
                      <div className="flex min-w-44 flex-col gap-1">
                        <Input
                          aria-label={`${row.draft.name} 导入目标域名`}
                          value={row.domain}
                          disabled={!editable}
                          onChange={(event) => {
                            setSubmitted(false)
                            setRows((current) =>
                              current.map((item) =>
                                item.draft.key === row.draft.key ? { ...item, domain: event.target.value } : item,
                              ),
                            )
                          }}
                        />
                        <Input
                          aria-label={`${row.draft.name} 导入域名 ID`}
                          type="number"
                          min={1}
                          placeholder="域名 ID（可选）"
                          value={row.domainId ?? ''}
                          disabled={!editable}
                          onChange={(event) => {
                            setSubmitted(false)
                            setRows((current) =>
                              current.map((item) =>
                                item.draft.key === row.draft.key
                                  ? { ...item, domainId: event.target.value ? Number(event.target.value) : undefined }
                                  : item,
                              ),
                            )
                          }}
                        />
                      </div>
                    ),
                  },
                ]
              : []),
            { key: 'name', label: '主机记录', render: (row) => input(row, 'name', '主机记录') },
            {
              key: 'type',
              label: '记录类型',
              render: (row) => (
                <div className="min-w-28">
                  <BatchSelect
                    value={row.draft.type}
                    items={RECORD_TYPES.map((value) => ({ value, label: value }))}
                    disabled={!editable}
                    label="记录类型"
                    onChange={(type) => update(row.draft.key, { type })}
                  />
                </div>
              ),
            },
            { key: 'value', label: '记录值', render: (row) => input(row, 'value', '记录值') },
            { key: 'line', label: '线路（名称或 ID）', render: (row) => input(row, 'line', '线路') },
            { key: 'ttl', label: 'TTL', render: (row) => input(row, 'ttl', 'TTL', 'number') },
            { key: 'mx', label: 'MX 优先级', render: (row) => input(row, 'mxPriority', 'MX 优先级', 'number') },
            { key: 'weight', label: '权重', render: (row) => input(row, 'weight', '权重', 'number') },
            { key: 'remark', label: '备注', render: (row) => input(row, 'remark', '备注') },
            {
              key: 'remove',
              label: '操作',
              render: (row) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="移除此行"
                  disabled={busy || rows.length === 1}
                  onClick={() => {
                    setSubmitted(false)
                    setRows((current) => current.filter((item) => item.draft.key !== row.draft.key))
                  }}
                >
                  <Trash2Icon />
                </Button>
              ),
            },
          ]}
        />
        {!importMode ? (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={busy || rows.length >= BATCH_LIMIT}
            onClick={() => {
              setSubmitted(false)
              setRows((current) => [...current, { domain: '', draft: emptyRecordDraft(`row-${++sequence.current}`) }])
            }}
          >
            <PlusIcon data-icon="inline-start" />
            再添加一条记录
          </Button>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {rows.length} 行 · {domains.length} 个域名 / 账户 · 预计添加 {count}{' '}
          条记录。空线路使用服务商默认线路，其他线路将严格匹配，不会静默替换。
        </p>
        {alreadySubmitted ? (
          <Alert>
            <AlertDescription>
              本次输入已执行过，避免重复添加。如需调整，请修改表格；失败项和未执行项可在下方单独预览重试。
            </AlertDescription>
          </Alert>
        ) : null}
        <BatchSubmit
          label="添加记录"
          prepare={prepare}
          busy={busy}
          disabled={disabled || alreadySubmitted || (importMode && !fileName)}
          onBusyChange={onBusyChange}
          onComplete={(label, results) => {
            setSubmitted(true)
            setSubmittedScope(scope)
            onComplete(label, results)
          }}
        />
      </CardContent>
    </Card>
  )
}
