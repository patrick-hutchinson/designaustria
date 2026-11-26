import { describe, expect, it } from 'vitest'

import {
  fixedOpeningHours,
  htmlToLines,
  linesToText,
  mapAdmissionKind,
  mapVisibility,
  normalizeEventLink,
  parsePlace,
  splitImportText,
} from './event-mappers'

describe('splitImportText', () => {
  it('splits on the markers', () => {
    expect(splitImportText('<!--place-->designforum Wien<br />MQ<!--costs-->Eintritt frei')).toEqual({
      place: 'designforum Wien<br />MQ',
      costs: 'Eintritt frei',
      rest: null,
    })
  })
  it('keeps text without markers and treats empty parts as missing', () => {
    expect(splitImportText('Anmeldung erforderlich')).toEqual({ place: null, costs: null, rest: 'Anmeldung erforderlich' })
    expect(splitImportText('<!--place-->\n<!--costs--><br />')).toEqual({ place: null, costs: null, rest: null })
  })
})

describe('htmlToLines', () => {
  it('breaks on <br>, <div>, <p> and newlines and decodes entities', () => {
    expect(htmlToLines('\n<div>designforum&nbsp;Wien</div>\n<div>MQ, Museumsplatz 1</div><strong>1070</strong> Wien<br/>')).toEqual([
      'designforum Wien',
      'MQ, Museumsplatz 1',
      '1070 Wien',
    ])
  })
  it('reads literal \\n', () => {
    expect(linesToText('Mo bis Fr 10 bis 18 Uhr\\nSa, So 13 bis 18 Uhr')).toBe('Mo bis Fr 10 bis 18 Uhr\nSa, So 13 bis 18 Uhr')
  })
})

describe('parsePlace', () => {
  it('reads name, street and postcode city', () => {
    expect(parsePlace('designforum Wien<br>MQ, Museumsplatz 1<br>1070 Wien')).toEqual({
      name: 'designforum Wien',
      street: 'MQ, Museumsplatz 1',
      zip: '1070',
      city: 'Wien',
      country: null,
      parsed: true,
    })
  })
  it('adds extra lines to the name', () => {
    const place = parsePlace('designforum Vorarlberg <br />CAMPUS V <br />Hintere Achmühlerstraße 1 <br />6850 Dornbirn')
    expect(place).toMatchObject({ name: 'designforum Vorarlberg\nCAMPUS V', street: 'Hintere Achmühlerstraße 1', zip: '6850', city: 'Dornbirn' })
  })
  it('reads street and postcode on one line, with a country prefix', () => {
    expect(parsePlace('Museum der Dinge, <br />Oranienstraße 25, D-10999 Berlin')).toMatchObject({
      name: 'Museum der Dinge',
      street: 'Oranienstraße 25',
      zip: '10999',
      city: 'Berlin',
      country: 'DE',
      parsed: true,
    })
  })
  it('takes off a country line and trailing commas', () => {
    expect(parsePlace('Gasteig, Black Box, <br />Rosenheimer Straße 5, <br />81667 München,<br />Deutschland')).toMatchObject({
      name: 'Gasteig, Black Box',
      street: 'Rosenheimer Straße 5',
      zip: '81667',
      city: 'München',
      country: 'DE',
      parsed: true,
    })
  })
  it('reads a place on one line', () => {
    expect(parsePlace('designforum Steiermark im Kunsthaus Graz, Lendkai 1, 8020 Graz')).toMatchObject({
      name: 'designforum Steiermark im Kunsthaus Graz',
      street: 'Lendkai 1',
      zip: '8020',
      city: 'Graz',
    })
    expect(parsePlace('Looshaus, 1010 Wien')).toMatchObject({ name: 'Looshaus', street: null, zip: '1010', city: 'Wien' })
  })
  it('puts anything else in the name', () => {
    expect(parsePlace('online über Zoom')).toMatchObject({ name: 'online über Zoom', street: null, parsed: false })
    expect(parsePlace('<strong>Gallery</strong><br />Pärnu mnt. 6, Tallinn, Estland')).toMatchObject({
      name: 'Gallery\nPärnu mnt. 6, Tallinn, Estland',
      parsed: false,
    })
  })
})

describe('mapAdmissionKind', () => {
  it('maps the ACF types', () => {
    expect(mapAdmissionKind('Normpreis').value).toBe('regular')
    expect(mapAdmissionKind('regulär').value).toBe('regular')
    expect(mapAdmissionKind('ermäßigt').value).toBe('reduced')
    expect(mapAdmissionKind('ermäßigt für designaustria-Mitglieder').value).toBe('members')
    expect(mapAdmissionKind('sonstige').value).toBe('other')
    expect(mapAdmissionKind('VIP').warning).toMatch(/unknown/)
  })
})

describe('mapVisibility', () => {
  it('treats missing as everywhere', () => {
    expect(mapVisibility(undefined).value).toBe('everywhere')
    expect(mapVisibility('nostart').value).toBe('notOnHome')
    expect(mapVisibility('none').value).toBe('hidden')
  })
})

describe('fixedOpeningHours', () => {
  it('writes out enabled rows', () => {
    expect(
      fixedOpeningHours([
        { label: 'Mo–Fr', enabled: '1', from: '10:00:00', to: '18:00:00' },
        { label: 'Sa–So', enabled: '1', from: '13:00:00', to: '18:00:00' },
      ]),
    ).toBe('Mo–Fr 10:00–18:00\nSa–So 13:00–18:00')
    expect(fixedOpeningHours([{ label: 'Mo–Fr', enabled: '1', from: '', to: '' }])).toBeNull()
    expect(fixedOpeningHours([{ label: 'Mo–Fr', enabled: '0', from: '10:00:00', to: '18:00:00' }])).toBeNull()
  })
})

describe('normalizeEventLink', () => {
  it('fixes mangled URLs', () => {
    expect(normalizeEventLink('/&lt;http:/www.weissraum.at/&gt;').value).toBe('http://www.weissraum.at/')
    expect(normalizeEventLink('www.designpfad.at').value).toBe('https://www.designpfad.at/')
    expect(normalizeEventLink('http:// www.erdgespraeche.net').value).toBe('http://www.erdgespraeche.net/')
  })
  it('keeps mailto and turns bare addresses into mailto', () => {
    expect(normalizeEventLink('mailto:office@designaustria.at').value).toBe('mailto:office@designaustria.at')
    expect(normalizeEventLink('office@designaustria.at').value).toBe('mailto:office@designaustria.at')
  })
})
