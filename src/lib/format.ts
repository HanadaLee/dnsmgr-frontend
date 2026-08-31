export function formatDateTime(value?: string | number): string {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'string' && !/^\d+$/.test(value)) return value
  const date = new Date(typeof value === 'number' && value < 10_000_000_000 ? value * 1000 : value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false })
}

export function displayValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (Array.isArray(value)) return value.length ? value.join('、') : '—'
  return String(value)
}

export function splitLines(value: string): string[] {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)
}

export function initials(value: string): string {
  const trimmed = value.trim()
  return trimmed ? Array.from(trimmed).slice(0, 2).join('').toUpperCase() : 'DNS'
}
