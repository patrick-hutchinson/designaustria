import { describe, expect, it } from 'vitest'

import { parseId, parseIdList, parseStringList } from './ids'

describe('parseIdList', () => {
  it('reads both formats of da_member_community', () => {
    expect(parseIdList('a:1:{i:0;s:4:"2890";}')).toEqual([2890])
    expect(parseIdList('2890')).toEqual([2890]) // older rows: bare ID
  })

  it('reads multi-value relations, keeps order, drops duplicates', () => {
    expect(parseIdList('a:3:{i:0;s:5:"11743";i:1;s:4:"9793";i:2;s:5:"11743";}')).toEqual([11743, 9793])
    expect(parseIdList('a:2:{i:0;i:12;i:1;i:7;}')).toEqual([12, 7])
  })

  it('treats empty values and 0 as "no link"', () => {
    for (const value of [null, undefined, '', '  ', '0', 'a:0:{}', 'a:1:{i:0;s:0:"";}']) {
      expect(parseIdList(value)).toEqual([])
    }
  })

  it('drops non-numeric entries', () => {
    expect(parseIdList('a:2:{i:0;s:3:"abc";i:1;s:2:"42";}')).toEqual([42])
    expect(parseIdList('not-an-id')).toEqual([])
  })

  it('throws on broken serialized data instead of losing links', () => {
    expect(() => parseIdList('a:2:{i:0;s:4:"2890";}')).toThrow()
  })
})

describe('parseId', () => {
  it('returns the first ID or null', () => {
    expect(parseId('456')).toBe(456)
    expect(parseId('0')).toBeNull()
    expect(parseId('')).toBeNull()
  })
})

describe('parseStringList', () => {
  it('reads checkbox values', () => {
    expect(parseStringList('a:2:{i:0;s:8:"standard";i:1;s:9:"bildrecht";}')).toEqual(['standard', 'bildrecht'])
    expect(parseStringList('a:0:{}')).toEqual([])
    expect(parseStringList('entrepreneur')).toEqual(['entrepreneur'])
    expect(parseStringList('')).toEqual([])
  })
})
