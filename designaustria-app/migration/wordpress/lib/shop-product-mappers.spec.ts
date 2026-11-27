import { describe, expect, it } from 'vitest'

import { mapStock, mapTaxClass, parseDownloadFiles, parseDownloadLimit, priceToCents, shopProductName, shopSku, TAX_CATEGORIES } from './shop-product-mappers'

describe('shopSku', () => {
  it('derives the SKU from the WC product id', () => {
    expect(shopSku(32510)).toBe('WP-32510')
  })
})

describe('priceToCents', () => {
  it('converts euros to integer cents without float errors', () => {
    expect(priceToCents('92.40')).toEqual({ value: 9240 })
    expect(priceToCents('15.9')).toEqual({ value: 1590 })
    expect(priceToCents('10')).toEqual({ value: 1000 })
    expect(priceToCents('0')).toEqual({ value: 0 })
    expect(priceToCents('19,99')).toEqual({ value: 1999 })
    expect(priceToCents('')).toEqual({ value: null })
  })
  it('rejects anything else', () => {
    expect(priceToCents('€10').warning).toBeDefined()
    expect(priceToCents('1.234').warning).toBeDefined()
  })
})

describe('mapTaxClass', () => {
  it('maps the empty class and 10 to 10 %', () => {
    expect(mapTaxClass('')).toEqual({ value: TAX_CATEGORIES.reduced10 })
    expect(mapTaxClass('10')).toEqual({ value: TAX_CATEGORIES.reduced10 })
    expect(mapTaxClass('20')).toEqual({ value: TAX_CATEGORIES.standard20 })
  })
  it('warns on unknown classes', () => {
    expect(mapTaxClass('5')).toEqual({ value: null, warning: 'tax_class: unknown value "5"' })
  })
})

describe('mapStock', () => {
  it('keeps managed stock', () => {
    expect(mapStock({ manageStock: 'yes', stock: '9', stockStatus: 'instock' })).toEqual({ value: { trackInventory: true, stockOnHand: 9 } })
    expect(mapStock({ manageStock: 'yes', stock: '-2', stockStatus: 'outofstock' })).toEqual({ value: { trackInventory: true, stockOnHand: 0 } })
  })
  it('turns out-of-stock without managed stock into tracked with 0', () => {
    expect(mapStock({ manageStock: 'no', stock: '', stockStatus: 'outofstock' })).toEqual({ value: { trackInventory: true, stockOnHand: 0 } })
  })
  it('leaves everything else untracked', () => {
    expect(mapStock({ manageStock: 'no', stock: '0', stockStatus: 'instock' })).toEqual({ value: { trackInventory: false, stockOnHand: 0 } })
  })
  it('warns on an unknown status', () => {
    expect(mapStock({ manageStock: 'no', stock: '', stockStatus: 'gone' }).warning).toBeDefined()
  })
})

describe('downloads', () => {
  it('reads _downloadable_files', () => {
    const value =
      'a:1:{s:36:"4b524d26-6611-498f-be2e-2f4eca421654";a:3:{s:2:"id";s:36:"4b524d26-6611-498f-be2e-2f4eca421654";s:4:"name";s:0:"";s:4:"file";s:23:"https://x.at/a/file.pdf";}}'
    expect(parseDownloadFiles(value)).toEqual({ files: [{ name: null, file: 'https://x.at/a/file.pdf' }], repaired: false })
    expect(parseDownloadFiles('')).toEqual({ files: [], repaired: false })
  })
  it('reads values with wrong string lengths by pattern', () => {
    const broken = 'a:1:{s:3:"abc";a:3:{s:2:"id";s:3:"abc";s:4:"name";s:4:"Info";s:4:"file";s:99:"https://x.at/b.pdf";}}'
    expect(parseDownloadFiles(broken)).toEqual({ files: [{ name: 'Info', file: 'https://x.at/b.pdf' }], repaired: true })
  })
  it('treats -1 as unlimited', () => {
    expect(parseDownloadLimit('-1')).toBeNull()
    expect(parseDownloadLimit('3')).toBe(3)
  })
})

describe('shopProductName', () => {
  it('removes soft hyphens', () => {
    expect(shopProductName('Grafik­design')).toBe('Grafikdesign')
    expect(shopProductName('Grafik&shy;design')).toBe('Grafikdesign')
  })
})
