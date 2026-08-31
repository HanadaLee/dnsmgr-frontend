import { useState, type ReactElement, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

export type FormOption = { value: string; label: string }
export type FormFieldSpec = {
  name: string
  label: string
  kind?: 'text' | 'email' | 'password' | 'number' | 'time' | 'datetime-local' | 'textarea' | 'select' | 'switch'
  placeholder?: string
  description?: string
  required?: boolean
  disabled?: boolean
  min?: number
  max?: number
  options?: FormOption[] | ((values: Record<string, unknown>) => FormOption[])
  visible?: (values: Record<string, unknown>) => boolean
}

function formValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value)
}

export function FieldsEditor({
  fields,
  values,
  onChange,
}: {
  fields: FormFieldSpec[]
  values: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
}) {
  return (
    <FieldGroup>
      {fields.filter((field) => !field.visible || field.visible(values)).map((field) => {
        const kind = field.kind ?? 'text'
        const fieldOptions = typeof field.options === 'function' ? field.options(values) : field.options ?? []
        if (kind === 'switch') {
          return (
            <Field key={field.name} orientation="horizontal">
              <FieldLabel htmlFor={field.name}>{field.label}</FieldLabel>
              <Switch
                id={field.name}
                checked={Boolean(values[field.name])}
                disabled={field.disabled}
                onCheckedChange={(checked) => onChange({ ...values, [field.name]: checked })}
              />
              {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
            </Field>
          )
        }

        return (
          <Field key={field.name}>
            <FieldLabel htmlFor={field.name}>{field.label}</FieldLabel>
            {kind === 'textarea' ? (
              <Textarea
                id={field.name}
                value={formValue(values[field.name])}
                placeholder={field.placeholder}
                required={field.required}
                disabled={field.disabled}
                rows={4}
                onChange={(event) => onChange({ ...values, [field.name]: event.target.value })}
              />
            ) : kind === 'select' ? (
              <Select
                items={fieldOptions}
                value={formValue(values[field.name]) || null}
                disabled={field.disabled}
                onValueChange={(value) => onChange({ ...values, [field.name]: value ?? '' })}
              >
                <SelectTrigger id={field.name} className="w-full">
                  <SelectValue placeholder={field.placeholder ?? `请选择${field.label}`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {fieldOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={field.name}
                type={kind}
                value={formValue(values[field.name])}
                placeholder={field.placeholder}
                required={field.required}
                disabled={field.disabled}
                min={field.min}
                max={field.max}
                onChange={(event) => onChange({
                  ...values,
                  [field.name]: kind === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value,
                })}
              />
            )}
            {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
          </Field>
        )
      })}
    </FieldGroup>
  )
}

export function FormDialog({
  trigger,
  title,
  description,
  fields,
  initialValues = {},
  submitLabel = '保存',
  pending = false,
  children,
  onSubmit,
}: {
  trigger: ReactElement
  title: string
  description?: string
  fields?: FormFieldSpec[]
  initialValues?: Record<string, unknown>
  submitLabel?: string
  pending?: boolean
  children?: (values: Record<string, unknown>, onChange: (values: Record<string, unknown>) => void) => ReactNode
  onSubmit: (values: Record<string, unknown>, close: () => void) => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, unknown>>(initialValues)

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (nextOpen) setValues(initialValues); setOpen(nextOpen) }}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        <form onSubmit={(event) => { event.preventDefault(); void onSubmit(values, () => setOpen(false)) }}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="py-5">
            {children ? children(values, setValues) : <FieldsEditor fields={fields ?? []} values={values} onChange={setValues} />}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>取消</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
