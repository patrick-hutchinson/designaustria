import { describe, expect, it } from 'vitest'

import {
  authorsText,
  mapMembersAccess,
  memberName,
  normalizeIsbn,
  parsePages,
  parsePublicationYear,
  PUBLICATIONS_CATEGORY_ID,
  withPublicationsCategory,
} from './product-mappers'

describe('withPublicationsCategory', () => {
  const inTree = (id: number) => [PUBLICATIONS_CATEGORY_ID, 25, 154].includes(id)
  it('keeps categories that are already in the Publikationen tree', () => {
    expect(withPublicationsCategory([7, 154], inTree)).toEqual({ ids: [7, 154], added: false })
  })
  it('adds Publikationen otherwise', () => {
    expect(withPublicationsCategory([], inTree)).toEqual({ ids: [PUBLICATIONS_CATEGORY_ID], added: true })
    expect(withPublicationsCategory([7], inTree)).toEqual({ ids: [7, PUBLICATIONS_CATEGORY_ID], added: true })
  })
})

describe('mapMembersAccess', () => {
  it('maps show and download', () => {
    expect(mapMembersAccess('a:2:{i:0;s:4:"show";i:1;s:8:"download";}')).toEqual({ value: { content: true, documents: true }, unknown: [] })
    expect(mapMembersAccess('a:1:{i:0;s:8:"download";}')).toEqual({ value: { content: false, documents: true }, unknown: [] })
    expect(mapMembersAccess('')).toEqual({ value: { content: false, documents: false }, unknown: [] })
  })
  it('reports unknown values', () => {
    expect(mapMembersAccess('a:1:{i:0;s:3:"all";}').unknown).toEqual(['all'])
  })
})

describe('normalizeIsbn', () => {
  it('trims and normalises spaces', () => {
    expect(normalizeIsbn('978-3-900364-64-9 ')).toBe('978-3-900364-64-9')
    expect(normalizeIsbn(' ISSN  1022-9574 ')).toBe('ISSN 1022-9574')
    expect(normalizeIsbn(' ')).toBeNull()
  })
})

describe('parsePages / parsePublicationYear', () => {
  it('accepts whole numbers only', () => {
    expect(parsePages('224')).toEqual({ value: 224 })
    expect(parsePages('')).toEqual({ value: null })
    expect(parsePages('48 Seiten').warning).toBeDefined()
    expect(parsePages('0').warning).toBeDefined()
  })
  it('takes four-digit years only', () => {
    expect(parsePublicationYear('2018')).toEqual({ value: 2018 })
    expect(parsePublicationYear('')).toEqual({ value: null })
    expect(parsePublicationYear('92')).toEqual({ value: null, warning: 'year: invalid "92"' })
  })
})

describe('authors', () => {
  it('builds a member name from first and last name, else the title', () => {
    expect(memberName('Anna', 'Muster', 'x')).toBe('Anna Muster')
    expect(memberName('', '', 'Studio X')).toBe('Studio X')
  })
  it('puts unmigrated members before the external authors, without repeating names', () => {
    expect(authorsText(['Anna Muster', 'Ben Beispiel'], 'Stiftung Buchkunst')).toBe('Anna Muster, Ben Beispiel, Stiftung Buchkunst')
    expect(authorsText(['Anna Muster'], 'Anna Muster und andere')).toBe('Anna Muster und andere')
    expect(authorsText([], '')).toBeNull()
  })
})
