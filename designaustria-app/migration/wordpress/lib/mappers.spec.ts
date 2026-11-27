import { describe, expect, it } from 'vitest'

import {
  cleanText,
  decodeEntities,
  mapEmploymentType,
  mapLinkType,
  mapPaymentFrequency,
  mapPhoneType,
  mapProfileStatus,
  mapSalutation,
  memberNumber,
  normalizeCountry,
  normalizeUrl,
  parseBool,
  parseDate,
  parseYear,
  wpPostDate,
} from './mappers'

describe('text', () => {
  it('decodes HTML entities', () => {
    expect(decodeEntities('HFA-Studio GmbH &amp; Co KG')).toBe('HFA-Studio GmbH & Co KG')
    expect(decodeEntities('&quot;a&quot; &#8211; &#x00FC; &uuml;')).toBe('"a" – ü ü')
    expect(decodeEntities('&unknown; stays')).toBe('&unknown; stays')
    expect(decodeEntities('Grafik&shy;designerinnen')).toBe('Grafik­designerinnen')
  })

  it('cleans text: trims, empty → null, keeps inner line breaks', () => {
    expect(cleanText('  Grafik  ')).toBe('Grafik')
    expect(cleanText('   ')).toBeNull()
    expect(cleanText(null)).toBeNull()
    expect(cleanText('line 1\r\nline 2')).toBe('line 1\nline 2')
  })
})

describe('enum mappers', () => {
  it('maps values found in the dump', () => {
    expect(mapSalutation('f').value).toBe('f')
    expect(mapEmploymentType('Selbstständig').value).toBe('selfEmployed')
    expect(mapEmploymentType('Angestellt').value).toBe('employed')
    expect(mapPaymentFrequency('year').value).toBe('yearly')
    expect(mapPaymentFrequency('trimester').value).toBe('quarterly')
    expect(mapPhoneType('fax').value).toBe('fax')
  })

  it('maps old link type labels', () => {
    expect(mapLinkType('Web').value).toBe('web')
    expect(mapLinkType('Website').value).toBe('web')
    expect(mapLinkType('Twitter').value).toBe('x')
    expect(mapLinkType('X (Twitter)').value).toBe('x')
    expect(mapLinkType('LinkedIn').value).toBe('linkedin')
  })

  it('empty → null without warning; unknown → null with warning', () => {
    expect(mapSalutation('')).toEqual({ value: null })
    expect(mapSalutation('x')).toEqual({ value: null, warning: 'salutation: unknown value "x"' })
  })

  it('copies post_status 1:1 and rejects auto-draft/trash', () => {
    expect(mapProfileStatus('pending').value).toBe('pending')
    expect(mapProfileStatus('auto-draft').value).toBeNull()
    expect(mapProfileStatus('trash').value).toBeNull()
  })
})

describe('memberNumber', () => {
  it('keeps real numbers including the -N suffix', () => {
    expect(memberNumber('012345')).toBe('012345')
    expect(memberNumber('012345-2')).toBe('012345-2')
  })

  it('treats the 000000 placeholder as "no number"', () => {
    expect(memberNumber('000000')).toBeNull()
    expect(memberNumber('000000-17')).toBeNull()
    expect(memberNumber('')).toBeNull()
  })
})

describe('normalizeCountry', () => {
  it('maps the free-text values found in the dump', () => {
    for (const value of ['AT', 'at', 'Österreich', 'Austria', 'A', 'AUT', 'Tirol', 'Wien']) {
      expect(normalizeCountry(value).value).toBe('AT')
    }
    expect(normalizeCountry('Deutschland').value).toBe('DE')
    expect(normalizeCountry('CH').value).toBe('CH')
    for (const value of ['Östereich', 'Österrich', 'Österreicj', 'Ö', 'Vorarlberg', 'Salzburg']) {
      expect(normalizeCountry(value).value).toBe('AT')
    }
    expect(normalizeCountry('Ägypten').value).toBe('EG')
  })

  it('treats dashes as empty and reports unknown values', () => {
    expect(normalizeCountry('-')).toEqual({ value: null })
    expect(normalizeCountry('Atlantis')).toEqual({ value: null, warning: 'country: unmapped value "Atlantis"' })
  })
})

describe('normalizeUrl', () => {
  it('adds https:// when missing', () => {
    expect(normalizeUrl('www.designaustria.at').value).toBe('https://www.designaustria.at/')
    expect(normalizeUrl('http://example.com/a').value).toBe('http://example.com/a')
  })

  it('rejects things that are not web URLs', () => {
    expect(normalizeUrl('@handle').value).toBeNull()
    expect(normalizeUrl('mailto:a@b.at').warning).toMatch(/invalid/)
    expect(normalizeUrl('')).toEqual({ value: null })
  })
})

describe('dates and numbers', () => {
  it('parses ACF dates at noon UTC', () => {
    expect(parseDate('1990-01-01').value).toBe('1990-01-01T12:00:00.000Z')
    expect(parseDate('19900101').value).toBe('1990-01-01T12:00:00.000Z')
    expect(parseDate('0000-00-00').value).toBeNull()
    expect(parseDate('1990-02-31').warning).toMatch(/invalid/)
  })

  it('uses post_date_gmt, falls back to post_date', () => {
    expect(wpPostDate('2019-12-19 21:45:10', '2019-12-19 22:45:10')).toBe('2019-12-19T21:45:10.000Z')
    expect(wpPostDate('0000-00-00 00:00:00', '2021-04-13 00:00:00')).toBe('2021-04-13T00:00:00.000Z')
    expect(wpPostDate('0000-00-00 00:00:00', '0000-00-00 00:00:00')).toBeNull()
  })

  it('parses years and booleans', () => {
    expect(parseYear('2011').value).toBe(2011)
    expect(parseYear('0').value).toBeNull()
    expect(parseYear('11').warning).toMatch(/invalid/)
    expect(parseBool('1')).toBe(true)
    expect(parseBool('0')).toBe(false)
    expect(parseBool('')).toBe(false)
  })
})
