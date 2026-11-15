// dnsmgr's tags controls persist comma-separated strings, not arrays.
export function tagValues(value: unknown): string[] {
  const parts = Array.isArray(value) ? value : [value];
  return [...new Set(parts.flatMap((part) => typeof part === 'string'
    ? part.split(/[\s,;，；]+/).map((item) => item.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')).filter(Boolean)
    : []))];
}

export function appendTagValues(value: unknown, draft: string): string {
  return tagValues([...tagValues(value), draft]).join(',');
}
