import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ProviderField } from '@/api/types'
import { defaultsForFields, DynamicFields } from '@/components/dynamic-fields'

const domain: ProviderField = { key: 'domain', label: '绑定的域名', control: 'tags', required: true, disabled: false, sensitive: false,
  visibleWhen: { any: ['cdn', 'obs'].map((value) => ({ all: [{ field: 'product', operator: 'equals', value }] })) } }
function render(values: Record<string, unknown>, field = domain) {
  return renderToStaticMarkup(<DynamicFields fields={[field]} values={values} onChange={vi.fn()} />)
}

describe('original dynamic form controls', () => {
  it.each(['cdn', 'obs'])('renders required Huawei domain input for %s', (product) => {
    expect(render({ product, domain: '' })).toContain('绑定的域名')
    expect(render({ product, domain: '' })).toContain('required=""')
  })
  it.each(['upload', 'waf', 'elb'])('hides irrelevant Huawei domain fields for %s', (product) => {
    expect(render({ product })).not.toContain('绑定的域名')
  })
  it('restores all saved domains without requiring an additional empty draft', () => {
    const markup = render({ product: 'cdn', domain: 'www.example.com,cdn.example.com' })
    expect(markup).toContain('www.example.com')
    expect(markup).toContain('cdn.example.com')
    expect(markup).toContain('移除 www.example.com')
    expect(markup).not.toContain('required=""')
  })
  it('honors disabled state and preserves defaults for all field types', () => {
    expect(render({ product: 'cdn', domain: 'www.example.com' }, { ...domain, disabled: true })).toContain('disabled=""')
    expect(defaultsForFields([domain, { ...domain, key: 'product', control: 'select', defaultValue: 'cdn' },
      { ...domain, key: 'enabled', control: 'checkbox' }, { ...domain, key: 'multiple', control: 'checkboxes' }]))
      .toEqual({ domain: '', product: 'cdn', enabled: false, multiple: [] })
  })
})
