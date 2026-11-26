import { describe, expect, it } from 'vitest'

import { slugify, uniqueSlugs } from './slugs'

describe('slugify', () => {
  it('transliterates German characters', () => {
    expect(slugify('Österreichische Markengeschichten – Größe')).toBe('oesterreichische-markengeschichten-groesse')
  })
  it('drops accents and punctuation', () => {
    expect(slugify('  Café »Design« 2025!  ')).toBe('cafe-design-2025')
  })
})

describe('uniqueSlugs', () => {
  it('keeps unique slugs unchanged', () => {
    const result = uniqueSlugs([{ id: 1, slug: 'a', title: null }, { id: 2, slug: 'b', title: null }])
    expect(result.get(1)).toEqual({ slug: 'a' })
    expect(result.get(2)).toEqual({ slug: 'b' })
  })
  it('suffixes clashes with the id, keeping the lowest id as is', () => {
    const result = uniqueSlugs([{ id: 9, slug: 'talk', title: null }, { id: 3, slug: 'talk', title: null }])
    expect(result.get(3)).toEqual({ slug: 'talk' })
    expect(result.get(9)).toEqual({ slug: 'talk-9', changedFrom: 'talk' })
  })
  it('builds empty slugs from the title', () => {
    expect(uniqueSlugs([{ id: 5, slug: '', title: 'Lange Nacht' }]).get(5)).toEqual({ slug: 'lange-nacht', changedFrom: null })
  })
})
