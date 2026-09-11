const aliases: Record<string, string> = {
  uk: 'gb',
  'cn-hk': 'hk',
  'cn_hk': 'hk',
  'cn-mo': 'mo',
  'cn_mo': 'mo',
  'cn-tw': 'tw',
  'cn_tw': 'tw',
  'cn-hkg': 'hk',
  'cn_macao': 'mo',
  'cn-twn': 'tw',
  'hong kong': 'hk',
  hongkong: 'hk',
  hkg: 'hk',
  香港: 'hk',
  中国香港: 'hk',
  macao: 'mo',
  macau: 'mo',
  mac: 'mo',
  澳门: 'mo',
  中国澳门: 'mo',
  taiwan: 'tw',
  twn: 'tw',
  台湾: 'tw',
  中国台湾: 'tw',
}

const flagIcons = import.meta.glob<string>(
  '/node_modules/flag-icons/flags/4x3/*.svg',
  { eager: true, import: 'default', query: '?url' },
)

export function CountryFlag({ countryCode, provinceCode }: { countryCode?: string; provinceCode?: string }) {
  const rawCode = countryCode?.trim().toLowerCase() ?? ''
  const rawProvinceCode = provinceCode?.trim().toLowerCase() ?? ''
  const provinceAlias = aliases[rawProvinceCode] ?? (['hk', 'mo', 'tw'].includes(rawProvinceCode) ? rawProvinceCode : undefined)
  const code = provinceAlias ?? aliases[rawCode] ?? rawCode
  if (!/^[a-z]{2}$/.test(code)) return null
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
