import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { RecordStatusToggle } from '@/components/record-status-toggle'

describe('record status toggle', () => {
  it.each(['enabled', 'disabled'] as const)('shows an explicit switch for %s records', (status) => {
    const markup = renderToStaticMarkup(<RecordStatusToggle record={{ name: 'www', type: 'A', status }} available pending={false} onChange={vi.fn()} />)
    expect(markup).toContain('role="switch"')
    expect(markup).toContain(`aria-checked="${status === 'enabled'}"`)
    expect(markup).toContain(`${status === 'enabled' ? '停用' : '启用'} www A 记录`)
  })

  it('disables the switch while a status request is pending', () => {
    const markup = renderToStaticMarkup(<RecordStatusToggle record={{ name: 'www', type: 'A', status: 'enabled' }} available pending onChange={vi.fn()} />)
    expect(markup).toContain('role="switch"')
    expect(markup).toContain('disabled=""')
  })

  it.each([
    { available: false, status: 'enabled' as const },
    { available: true, status: 'unknown' as const },
  ])('does not offer unsupported or unknown status changes: %j', ({ available, status }) => {
    const markup = renderToStaticMarkup(<RecordStatusToggle record={{ name: 'www', type: 'A', status }} available={available} pending={false} onChange={vi.fn()} />)
    expect(markup).not.toContain('role="switch"')
  })
})
