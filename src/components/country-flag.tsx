import { resolveCountryFlagCode } from '@/lib/country-flag'

const flagIcons = import.meta.glob<string>(
  '/node_modules/flag-icons/flags/4x3/*.svg',
  { eager: true, import: 'default', query: '?url' },
)

export function CountryFlag({ countryCode, provinceCode }: { countryCode?: string; provinceCode?: string }) {
  const code = resolveCountryFlagCode({ countryCode, provinceCode })
  if (!code) return null
  const source = flagIcons[`/node_modules/flag-icons/flags/4x3/${code}.svg`]
  if (!source) return null

  return (
    <img
      className="h-3 w-4 shrink-0 rounded-[1px] object-cover"
      src={source}
      alt={code.toUpperCase()}
      title={code.toUpperCase()}
    />
  )
}
