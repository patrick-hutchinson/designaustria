import { describe, expect, it } from 'vitest'

import { viennaToUtc } from './dates'

describe('viennaToUtc', () => {
  it('converts winter time (UTC+1)', () => {
    expect(viennaToUtc('2026-12-04 12:00:00').value).toBe('2026-12-04T11:00:00.000Z')
  })
  it('converts summer time (UTC+2)', () => {
    expect(viennaToUtc('2021-06-09 10:00:00').value).toBe('2021-06-09T08:00:00.000Z')
  })
  it('accepts times without seconds', () => {
    expect(viennaToUtc('2021-06-09 10:00').value).toBe('2021-06-09T08:00:00.000Z')
  })
  it('handles the days DST starts and ends', () => {
    expect(viennaToUtc('2025-03-30 01:30:00').value).toBe('2025-03-30T00:30:00.000Z') // before the switch
    expect(viennaToUtc('2025-03-30 03:30:00').value).toBe('2025-03-30T01:30:00.000Z') // after
    expect(viennaToUtc('2025-03-30 02:30:00').value).toBe('2025-03-30T01:30:00.000Z') // doesn't exist: +1 h
    expect(viennaToUtc('2025-10-26 02:30:00').value).toBe('2025-10-26T00:30:00.000Z') // twice: summer time
    expect(viennaToUtc('2025-10-26 04:00:00').value).toBe('2025-10-26T03:00:00.000Z')
  })
  it('treats empty and zero dates as missing', () => {
    expect(viennaToUtc('')).toEqual({ value: null })
    expect(viennaToUtc(null)).toEqual({ value: null })
    expect(viennaToUtc('0000-00-00 00:00:00')).toEqual({ value: null })
  })
  it('warns on invalid values', () => {
    expect(viennaToUtc('2026-02-30 10:00:00').warning).toMatch(/invalid/)
    expect(viennaToUtc('04.12.2026').warning).toMatch(/invalid/)
  })
})
