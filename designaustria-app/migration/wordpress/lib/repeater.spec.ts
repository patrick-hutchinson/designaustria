import { describe, expect, it } from 'vitest'

import { isEmptyRow, readRepeater } from './repeater'

describe('readRepeater', () => {
  const meta = {
    da_address: '2',
    da_address_0_da_address_city: 'Wien',
    da_address_0_da_address_country: 'AT',
    da_address_1_da_address_city: 'Graz',
    da_address_2_da_address_city: 'stale row beyond the count',
    _da_address_0_da_address_city: 'field_1720', // ACF field-key reference, not data
    da_member_firstname: 'unrelated',
  }

  it('rebuilds rows from numbered keys', () => {
    expect(readRepeater(meta, 'da_address')).toEqual([
      { da_address_city: 'Wien', da_address_country: 'AT' },
      { da_address_city: 'Graz' },
    ])
  })

  it('returns [] when the repeater is empty or missing', () => {
    expect(readRepeater({ da_online: '' }, 'da_online')).toEqual([])
    expect(readRepeater({ da_online: '0' }, 'da_online')).toEqual([])
    expect(readRepeater({}, 'da_online')).toEqual([])
  })

  it('does not mix up repeaters with a shared prefix', () => {
    const portfolio = {
      da_portfolio: '1',
      da_portfolio_0_da_portfolio_name: 'Poster',
      da_portfolio_show: 'not a row',
    }
    expect(readRepeater(portfolio, 'da_portfolio')).toEqual([{ da_portfolio_name: 'Poster' }])
  })
})

describe('isEmptyRow', () => {
  it('detects rows without any value', () => {
    expect(isEmptyRow({ a: '', b: '  ' })).toBe(true)
    expect(isEmptyRow({ a: '', b: 'x' })).toBe(false)
  })
})
