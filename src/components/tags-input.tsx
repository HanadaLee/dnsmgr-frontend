import { useState } from 'react'
import { XIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { appendTagValues, tagValues } from '@/lib/tag-values'

export function TagsInput({ id, value, onChange, required, disabled, placeholder }: {
  id: string
  value: unknown
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  const tags = tagValues(value)
  function commit(raw = draft) {
    if (disabled || !raw.trim()) return
    onChange(appendTagValues(value, raw))
    setDraft('')
  }
  return (
    <div className="flex flex-col gap-2">
      <InputGroup className="h-auto min-h-9" data-disabled={disabled || undefined}>
        {tags.length ? <InputGroupAddon align="block-start" className="flex-wrap">
          {tags.map((tag) => <Badge key={tag} variant="secondary">
            {tag}
            <Button type="button" variant="ghost" size="icon-xs" disabled={disabled} aria-label={`移除 ${tag}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChange(tags.filter((item) => item !== tag).join(','))}><XIcon /></Button>
          </Badge>)}
        </InputGroupAddon> : null}
        <InputGroupInput id={id} name={id} value={draft} disabled={disabled} required={required && tags.length === 0}
          placeholder={placeholder ?? '输入后回车添加，支持粘贴多个'}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => {
            // Do not move the submit button between pointerdown and click by
            // expanding the tag list. The form reads this draft on submission.
            if (event.relatedTarget instanceof HTMLButtonElement && event.relatedTarget.type === 'submit') return
            commit()
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text')
            if (/[\s,;，；]/.test(text)) { event.preventDefault(); commit(`${draft} ${text}`) }
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (['Enter', ',', '，', ';', '；'].includes(event.key)) { event.preventDefault(); commit() }
            else if (event.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1).join(','))
          }} />
      </InputGroup>
      {tags.length ? <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">已添加 {tags.length} 项</span>
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onMouseDown={(event) => event.preventDefault()}
          onClick={() => { setDraft(''); onChange('') }}>清空</Button>
      </div> : null}
    </div>
  )
}
