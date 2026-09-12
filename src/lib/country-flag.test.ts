import { describe, expect, it } from 'vitest'

import { resolveCountryFlagCode } from './country-flag'

describe('resolveCountryFlagCode', () => {
  it.each([
    ['edge.common.china-hongkong', 'hk'],
    ['parent.common.china-hongkong', 'hk'],
    ['edge.common.china-macao', 'mo'],
    ['edge.common.china-macau', 'mo'],
    ['edge.common.china-taiwan', 'tw'],
  ])('uses AxisNow region tag %s', (tagName, expected) => {
    expect(resolveCountryFlagCode({ countryCode: 'CN', tagNames: [tagName] })).toBe(expected)
  })

  it('prefers an explicit special-region code over tags and country', () => {
    expect(resolveCountryFlagCode({ countryCode: 'CN', provinceCode: 'CN-HK', tagNames: ['edge.common.japan'] })).toBe('hk')
  })

  it('falls back to the country code when no special region is present', () => {
    expect(resolveCountryFlagCode({ countryCode: 'CN', tagNames: ['edge.cps-all.asia'] })).toBe('cn')
  })
})
