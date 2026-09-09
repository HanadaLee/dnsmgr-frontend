const aliases: Record<string, string> = {
  uk: 'gb',
}

const flagIcons = import.meta.glob<string>(
  '/node_modules/flag-icons/flags/4x3/*.svg',
  { eager: true, import: 'default', query: '?url' },
)

export function CountryFlag({ countryCode }: { countryCode?: string }) {
  const rawCode = countryCode?.trim().toLowerCase() ?? ''
  const code = aliases[rawCode] ?? rawCode
  if (!/^[a-z]{2}$/.test(code)) return null
  const source = flagIcons[`/node_modules/flag-icons/flags/4x3/${code}.svg`]
  if (!source) return null

  return (
    <img
      className="h-3 w-4 shrink-0 rounded-[1px] object-cover"
      src={source}
      alt={rawCode.toUpperCase()}
      title={rawCode.toUpperCase()}
    />
  )
}
