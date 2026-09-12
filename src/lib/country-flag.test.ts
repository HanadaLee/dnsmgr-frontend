import { describe, expect, it } from 'vitest'

import { resolveCountryFlagCode } from './country-flag'

describe('resolveCountryFlagCode', () => {
  it.each([
    ['710000', 'tw'],
    ['71', 'tw'],
    ['910000', 'hk'],
    ['91', 'hk'],
    ['920000', 'mo'],
    ['92', 'mo'],
  ])('maps AxisNow province_code %s to %s', (provinceCode, expected) => {
    expect(resolveCountryFlagCode({ countryCode: 'CN', provinceCode })).toBe(expected)
  })

  it('accepts explicit secondary-region names and composite codes', () => {
    expect(resolveCountryFlagCode({ countryCode: 'CN', provinceCode: 'CN-HK' })).toBe('hk')
    expect(resolveCountryFlagCode({ countryCode: 'CN', provinceCode: 'Macao' })).toBe('mo')
    expect(resolveCountryFlagCode({ countryCode: 'CN', provinceCode: 'Taiwan' })).toBe('tw')
  })

  it('falls back to the country code when no secondary region is present', () => {
    expect(resolveCountryFlagCode({ countryCode: 'CN', provinceCode: '110000' })).toBe('cn')
  })
})
