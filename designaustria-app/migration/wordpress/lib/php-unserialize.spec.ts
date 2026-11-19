import { describe, expect, it } from 'vitest'

import { looksSerialized, phpUnserialize, PhpUnserializeError, tryUnserialize } from './php-unserialize'

describe('phpUnserialize', () => {
  it('parses scalars', () => {
    expect(phpUnserialize('N;')).toBeNull()
    expect(phpUnserialize('b:1;')).toBe(true)
    expect(phpUnserialize('b:0;')).toBe(false)
    expect(phpUnserialize('i:-42;')).toBe(-42)
    expect(phpUnserialize('d:0.5;')).toBe(0.5)
    expect(phpUnserialize('s:5:"hello";')).toBe('hello')
    expect(phpUnserialize('s:0:"";')).toBe('')
  })

  it('uses byte lengths for UTF-8 strings', () => {
    // "Österreich" is 10 characters but 11 bytes
    expect(phpUnserialize('s:11:"Österreich";')).toBe('Österreich')
    expect(phpUnserialize('a:1:{i:0;s:14:"Selbstständig";}')).toEqual(['Selbstständig'])
  })

  it('handles quotes and semicolons inside strings', () => {
    expect(phpUnserialize('s:7:"a";b"c;";')).toBe('a";b"c;')
  })

  it('turns PHP lists into arrays (ACF relation field)', () => {
    expect(phpUnserialize('a:2:{i:0;s:5:"11743";i:1;s:4:"9793";}')).toEqual(['11743', '9793'])
    expect(phpUnserialize('a:0:{}')).toEqual([])
  })

  it('turns other arrays into objects (attachment metadata)', () => {
    expect(phpUnserialize('a:2:{s:5:"width";i:2560;s:4:"file";s:8:"logo.jpg";}')).toEqual({ width: 2560, file: 'logo.jpg' })
    // keys not 0..n-1 → object
    expect(phpUnserialize('a:1:{i:3;s:1:"x";}')).toEqual({ '3': 'x' })
  })

  it('parses nested arrays (WooCommerce downloadable files)', () => {
    const value = 'a:1:{s:3:"abc";a:2:{s:4:"name";s:0:"";s:4:"file";s:5:"a.pdf";}}'
    expect(phpUnserialize(value)).toEqual({ abc: { name: '', file: 'a.pdf' } })
  })

  it('throws on broken input', () => {
    expect(() => phpUnserialize('s:10:"short";')).toThrow(PhpUnserializeError)
    expect(() => phpUnserialize('a:2:{i:0;s:1:"a";}')).toThrow(PhpUnserializeError)
    expect(() => phpUnserialize('i:1;extra')).toThrow(/trailing data/)
    expect(() => phpUnserialize('O:8:"stdClass":0:{}')).toThrow(/unsupported type/)
  })
})

describe('looksSerialized / tryUnserialize', () => {
  it('recognises serialized values only', () => {
    expect(looksSerialized('a:0:{}')).toBe(true)
    expect(looksSerialized('2890')).toBe(false)
    expect(looksSerialized('Wien')).toBe(false)
    expect(looksSerialized('a: note')).toBe(false)
  })

  it('returns undefined instead of throwing', () => {
    expect(tryUnserialize('plain text')).toBeUndefined()
    expect(tryUnserialize('s:99:"broken";')).toBeUndefined()
    expect(tryUnserialize('a:1:{i:0;s:3:"yes";}')).toEqual(['yes'])
  })
})
