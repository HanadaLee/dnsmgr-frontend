const aliases: Record<string, string> = {
  uk: 'gb',
  'cn-hk': 'hk',
  'cn-mo': 'mo',
  'cn-tw': 'tw',
  'cn-hkg': 'hk',
  'cn-macao': 'mo',
  'cn-macau': 'mo',
  'cn-twn': 'tw',
  'cn-hong-kong': 'hk',
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

type CountryFlagSource = {
  countryCode?: string
  provinceCode?: string
  tagNames?: readonly string[]
}

function normalizeCode(value: string): string {
  return value.trim().toLowerCase().replace(/[._/]+/g, '-').replace(/\s+/g, ' ')
}

function specialRegionFlag(value?: string): string | undefined {
  const normalized = normalizeCode(value ?? '')
  if (!normalized) return undefined
  const alias = aliases[normalized]
  if (alias) return alias

  const compact = normalized.replace(/[\s_-]+/g, '')
  if (compact === 'hk' || compact === 'hkg' || compact === '810' || compact.includes('hongkong') || compact.includes('香港') || compact.endsWith('hk')) return 'hk'
  if (compact === 'mo' || compact === 'mac' || compact === 'macao' || compact === 'macau' || compact === '446' || compact.includes('macao') || compact.includes('macau') || compact.includes('澳门') || compact.endsWith('mo')) return 'mo'
  if (compact === 'tw' || compact === 'twn' || compact === 'taiwan' || compact === '158' || compact.includes('taiwan') || compact.includes('台湾') || compact.endsWith('tw')) return 'tw'
  return undefined
}

export function resolveCountryFlagCode({ countryCode, provinceCode, tagNames = [] }: CountryFlagSource): string | undefined {
  const provinceFlag = specialRegionFlag(provinceCode)
  if (provinceFlag) return provinceFlag
  for (const tagName of tagNames) {
    const tagFlag = specialRegionFlag(tagName)
    if (tagFlag) return tagFlag
  }
  const rawCode = normalizeCode(countryCode ?? '')
  const countryFlag = specialRegionFlag(rawCode) ?? rawCode
  return /^[a-z]{2}$/.test(countryFlag) ? countryFlag : undefined
}
