import { describe, expect, it } from 'vitest'

import { mergeCategories, tagNames } from './post-mappers'

describe('mergeCategories', () => {
  it('keeps the ACF categories when the term links agree', () => {
    expect(mergeCategories([39, 37], [37, 39])).toEqual({ ids: [39, 37], differs: false })
  })
  it('ignores the default category WordPress adds by itself', () => {
    expect(mergeCategories([], [1])).toEqual({ ids: [], differs: false })
    expect(mergeCategories([37], [1])).toEqual({ ids: [37], differs: true })
    expect(mergeCategories([], [187])).toEqual({ ids: [], differs: false })
  })
  it('takes the union when they differ', () => {
    expect(mergeCategories([34, 49], [34])).toEqual({ ids: [34, 49], differs: true })
    expect(mergeCategories([], [39, 1])).toEqual({ ids: [39], differs: true })
  })
  it('keeps term 1 when the ACF field picked it', () => {
    expect(mergeCategories([1, 7], [1])).toEqual({ ids: [1, 7], differs: true })
  })
})

describe('tagNames', () => {
  it('trims, drops empty names and case-insensitive duplicates', () => {
    expect(tagNames([' Staatspreis ', '', null, 'staatspreis', 'Next Gen Design'])).toEqual(['Staatspreis', 'Next Gen Design'])
  })
})
