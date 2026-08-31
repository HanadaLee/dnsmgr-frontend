import type { ProviderField } from '@/api/types'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

function isVisible(field: ProviderField, values: Record<string, unknown>): boolean {
  if (!field.visibleWhen) return true
  return field.visibleWhen.any.some((branch) => branch.all.every((condition) => {
    const raw = values[condition.field]
    const current = typeof raw === 'boolean' ? (raw ? '1' : '0') : String(raw ?? '')
    return condition.operator === 'equals' ? current === condition.value : current !== condition.value
  }))
}

function inputContract(field: ProviderField) {
  if (field.sensitive) return { type: 'password', inputMode: undefined, pattern: undefined, step: undefined }
  if (field.validator === 'email') return { type: 'email', inputMode: 'email' as const, pattern: undefined, step: undefined }
  if (field.validator === 'uri') return { type: 'url', inputMode: 'url' as const, pattern: undefined, step: undefined }
  if (field.validator === 'phone') return { type: 'tel', inputMode: 'tel' as const, pattern: undefined, step: undefined }
  if (field.validator === 'digits') return { type: 'text', inputMode: 'numeric' as const, pattern: '[0-9]+', step: undefined }
  if (field.validator === 'integer') return { type: 'number', inputMode: 'numeric' as const, pattern: undefined, step: 1 }
  if (field.validator === 'numeric') return { type: 'number', inputMode: 'decimal' as const, pattern: undefined, step: 'any' as const }
  return { type: 'text', inputMode: undefined, pattern: undefined, step: undefined }
}

export function defaultsForFields(fields: ProviderField[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field.key, field.defaultValue ?? (field.control === 'checkbox' ? false : field.control === 'checkboxes' ? [] : '')]))
}

export function DynamicFields({
  fields,
  values,
  onChange,
}: {
  fields: ProviderField[]
  values: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
}) {
  return (
    <FieldGroup>
      {fields.filter((field) => isVisible(field, values)).map((field) => {
        if (field.control === 'checkbox') {
          return (
            <Field key={field.key} orientation="horizontal" data-disabled={field.disabled || undefined}>
              <FieldContent>
                <FieldLabel htmlFor={field.key}>{field.label}</FieldLabel>
                {field.note ? <FieldDescription>{field.note}</FieldDescription> : null}
              </FieldContent>
              <Switch
                id={field.key}
                checked={Boolean(values[field.key])}
                disabled={field.disabled}
                onCheckedChange={(checked) => onChange({ ...values, [field.key]: checked })}
              />
            </Field>
          )
        }

        if (field.control === 'checkboxes') {
          const selected = new Set(Array.isArray(values[field.key]) ? values[field.key] as string[] : [])
          return (
            <Field key={field.key}>
              <FieldTitle>{field.label}</FieldTitle>
              <div data-slot="checkbox-group" className="grid gap-3 sm:grid-cols-2">
                {(field.options ?? []).map((option) => (
                  <FieldLabel key={option.value}>
                    <Field orientation="horizontal">
                      <Checkbox
                        checked={selected.has(option.value)}
                        disabled={field.disabled}
                        onCheckedChange={(checked) => {
                          const next = new Set(selected)
                          if (checked) next.add(option.value)
                          else next.delete(option.value)
                          onChange({ ...values, [field.key]: Array.from(next) })
                        }}
                      />
                      <FieldTitle>{option.label}</FieldTitle>
                    </Field>
                  </FieldLabel>
                ))}
              </div>
              {field.note ? <FieldDescription>{field.note}</FieldDescription> : null}
            </Field>
          )
        }

        const value = values[field.key] === undefined || values[field.key] === null ? '' : String(values[field.key])
        const input = inputContract(field)
        const numeric = input.type === 'number'
        return (
          <Field key={field.key} data-disabled={field.disabled || undefined}>
            <FieldLabel htmlFor={field.key}>{field.label}</FieldLabel>
            {field.control === 'textarea' ? (
              <Textarea
                id={field.key}
                value={value}
                required={field.required}
                disabled={field.disabled}
                placeholder={field.placeholder}
                onChange={(event) => onChange({ ...values, [field.key]: event.target.value })}
              />
            ) : field.control === 'select' || field.control === 'radio' ? (
              <Select
                items={field.options ?? []}
                value={value || null}
                disabled={field.disabled}
                onValueChange={(next) => onChange({ ...values, [field.key]: next ?? '' })}
              >
                <SelectTrigger id={field.key} className="w-full"><SelectValue placeholder={field.placeholder ?? `请选择${field.label}`} /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(field.options ?? []).map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={field.key}
                type={input.type}
                inputMode={input.inputMode}
                pattern={input.pattern}
                step={input.step}
                value={value}
                required={field.required}
                disabled={field.disabled}
                placeholder={field.placeholder}
                min={numeric ? field.min : undefined}
                max={numeric ? field.max : undefined}
                onChange={(event) => onChange({ ...values, [field.key]: event.target.value })}
              />
            )}
            {field.note ? <FieldDescription>{field.note}</FieldDescription> : null}
          </Field>
        )
      })}
    </FieldGroup>
  )
}
