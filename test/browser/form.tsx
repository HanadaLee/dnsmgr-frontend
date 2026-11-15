import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ProviderField } from '@/api/types'
import { defaultsForFields, DynamicFields, serializeDynamicFields } from '@/components/dynamic-fields'
import { Button } from '@/components/ui/button'
import '@/index.css'

const fields: ProviderField[] = [
  { key: 'product', label: '产品', control: 'select', required: true, disabled: false, sensitive: false, defaultValue: 'cdn',
    options: [{ value: 'cdn', label: 'CDN' }, { value: 'obs', label: 'OBS' }, { value: 'upload', label: '上传证书' }] },
  { key: 'domain', label: '绑定的域名', control: 'tags', required: true, disabled: false, sensitive: false,
    visibleWhen: { any: ['cdn', 'obs'].map((value) => ({ all: [{ field: 'product', operator: 'equals', value }] })) } },
]
function Fixture() {
  const [values, setValues] = useState<Record<string, unknown>>(() => defaultsForFields(fields))
  const [saved, setSaved] = useState('尚未保存')
  const [disabled, setDisabled] = useState(false)
  return <main className="mx-auto flex max-w-xl flex-col gap-4 p-8">
    <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); setSaved(JSON.stringify(serializeDynamicFields(fields, values, event.currentTarget))) }}>
      <DynamicFields fields={fields.map((field) => ({ ...field, disabled }))} values={values} onChange={setValues} />
      <Button type="submit">保存</Button>
    </form>
    <Button onClick={() => setValues({ product: 'cdn', domain: 'www.example.com,cdn.example.com' })}>载入已有配置</Button>
    <Button onClick={() => setDisabled((current) => !current)}>切换禁用</Button>
    <pre id="saved">{saved}</pre>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
