import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { RecordToolsPage } from '@/pages/record-tools-page'

describe('record tools global search', () => {
  it('offers exact and contains modes with an accessible search field', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    client.setQueryData(['domains', 'all-record-tools'], [])

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/record-tools?tab=search']}>
          <RecordToolsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(markup).toContain('精确匹配')
    expect(markup).toContain('模糊匹配（包含）')
    expect(markup).toContain('aria-labelledby="global-record-match-mode"')
    expect(markup).toContain('for="global-record-value"')
    expect(markup).toContain('选择模糊匹配可搜索部分 IP、域名或其他记录值片段。')
    expect(markup).not.toContain('批量修改 0 条')
    client.clear()
  })
})
