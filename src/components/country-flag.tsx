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
  'cn-hong-kong': 'hk',
  'cn-macao': 'mo',
  'cn-macau': 'mo',
  'cn-taiwan': 'tw',
  '810': 'hk',
  '446': 'mo',
  '158': 'tw',
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

function normalizeCode(value: string): string {
  return value.trim().toLowerCase().replace(/[_.\/]+/g, '-').replace(/\s+/g, ' ')
}

function specialRegionFlag(value?: string): string | undefined {
  const normalized = normalizeCode(value ?? '')
  if (!normalized) return undefined
  const alias = aliases[normalized]
  if (alias) return alias

  const compact = normalized.replace(/[\s_-]+/g, '')
  if (compact === 'hk' || compact === 'hkg' || compact === '810' || compact.includes('hongkong') || compact.endsWith('hk')) return 'hk'
  if (compact === 'mo' || compact === 'mac' || compact === 'macao' || compact === 'macau' || compact === '446' || compact.includes('macao') || compact.includes('macau') || compact.includes('澳门') || compact.endsWith('mo')) return 'mo'
  if (compact === 'tw' || compact === 'twn' || compact === 'taiwan' || compact === '158' || compact.includes('taiwan') || compact.includes('台湾') || compact.endsWith('tw')) return 'tw'
  return undefined
}

export function CountryFlag({ countryCode, provinceCode }: { countryCode?: string; provinceCode?: string }) {
  const rawCode = normalizeCode(countryCode ?? '')
  const code = specialRegionFlag(provinceCode) ?? specialRegionFlag(rawCode) ?? rawCode
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
