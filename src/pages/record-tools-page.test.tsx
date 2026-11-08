import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RecordToolsPage } from '@/pages/record-tools-page'

const access = vi.hoisted(() => ({ domainAccounts: true, logs: true }))
vi.mock('@/auth/session-context', () => ({ useSession: () => ({ capabilities: access }) }))
afterEach(() => {
  access.domainAccounts = true
  access.logs = true
})

function renderPage(path = '/batch-operations') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(['domains', 'all-record-tools'], [])
  const markup = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <RecordToolsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  client.clear()
  return markup
}

describe('batch operations architecture', () => {
  it('defaults to optional-filter batch querying instead of global value search', () => {
    const markup = renderPage()
    expect(markup).toContain('批量操作')
    expect(markup).toContain('aria-label="批量操作类型"')
    expect(markup).toContain('批量查询')
    expect(markup).toContain('指定域名')
    expect(markup).toContain('指定分组')
    expect(markup).toContain('全部域名')
    expect(markup).toContain('aria-label="记录值匹配方式"')
    expect(markup).toContain('模糊匹配（包含）')
    expect(markup).toContain('for="batch-record-value"')
    expect(markup).toContain('条件均可留空')
    expect(markup).not.toContain('全域搜索')
    expect(markup).not.toContain('智能解析')
    expect(markup).not.toContain('高级解析工具')
  })

  it('offers independent record rows for adding and keeps legacy links usable', () => {
    const markup = renderPage('/record-tools?tab=batch-add')
    expect(markup).toContain('再添加一条记录')
    expect(markup).toContain('每行是一条独立记录')
    expect(markup).toContain('预览并')
  })

  it('has distinct import, export, deletion and log tasks', () => {
    const markup = renderPage('/batch-operations?task=import-record')
    for (const label of [
      '添加域名',
      '添加记录',
      '修改记录',
      '删除记录',
      '导入记录',
      '导出记录',
      '导出域名',
      '删除域名',
      '操作日志',
    ])
      expect(markup).toContain(label)
    expect(markup).toContain('下载模板')
    expect(markup).toContain('选择文件只加载预览，不会写入 DNS')
  })
  it('hides domain-management tasks without account-management capability', () => {
    access.domainAccounts = false
    const markup = renderPage('/batch-operations?task=delete-domain')
    expect(markup).not.toContain('添加域名')
    expect(markup).not.toContain('删除域名')
    expect(markup).toContain('查询记录')
  })
})
