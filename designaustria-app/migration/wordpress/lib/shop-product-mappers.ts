// Value mappers for shop products (Vendure Product + ProductVariant) from WooCommerce products. Plan: docs/06-products-plan.md §3.2–3.3, §4.4.

import { looksSerialized, phpUnserialize } from './php-unserialize'
import type { Mapped } from './mappers'

/** The key both sides derive from WordPress: Payload `products.shopSku` and the Vendure variant's SKU (§3.3). */
export const shopSku = (wcProductId: number): string => `WP-${wcProductId}`

/** Vendure tax categories by WooCommerce `_tax_class` (07-shop-plan §3). The empty (default) class is 10 % here. */
export const TAX_CATEGORIES = {
  reduced10: 'Ermäßigt 10 %',
  reduced13: 'Ermäßigt 13 %',
  standard20: 'Normal 20 %',
  zero: 'Steuerfrei',
} as const

const TAX_CLASSES: Record<string, string> = {
  '': TAX_CATEGORIES.reduced10,
  '10': TAX_CATEGORIES.reduced10,
  '13': TAX_CATEGORIES.reduced13,
  '20': TAX_CATEGORIES.standard20,
  'zero-rate': TAX_CATEGORIES.zero,
}

export function mapTaxClass(value: string | null | undefined): Mapped<string> {
  const key = value?.trim() ?? ''
  const category = TAX_CLASSES[key]
  return category ? { value: category } : { value: null, warning: `tax_class: unknown value "${key}"` }
}

/** "92.40" (euros, as WooCommerce stores them) → 9240 cents. Empty → null. */
export function priceToCents(value: string | null | undefined): Mapped<number> {
  const text = value?.trim()
  if (!text) return { value: null }
  if (!/^\d+([.,]\d{1,2})?$/.test(text)) return { value: null, warning: `price: invalid "${text}"` }
  const [euros, cents = ''] = text.split(/[.,]/)
  return { value: Number(euros) * 100 + Number(cents.padEnd(2, '0')) }
}

/**
 * Stock (§3.2): managed stock keeps its count; `outofstock` without managed stock becomes tracked with 0 on hand
 * (sold out, staff can restock); everything else is untracked (unlimited).
 */
export function mapStock({
  manageStock,
  stock,
  stockStatus,
}: {
  manageStock: string | undefined
  stock: string | undefined
  stockStatus: string | undefined
}): Mapped<{ trackInventory: boolean; stockOnHand: number }> {
  const status = stockStatus?.trim() || 'instock'
  if (!['instock', 'outofstock', 'onbackorder'].includes(status)) {
    return { value: null, warning: `stock_status: unknown value "${status}"` }
  }
  if (manageStock?.trim() === 'yes') {
    const count = Number(stock?.trim() || '0')
    if (!Number.isFinite(count)) return { value: null, warning: `stock: invalid "${stock}"` }
    return { value: { trackInventory: true, stockOnHand: Math.max(0, Math.floor(count)) } }
  }
  if (status === 'outofstock') return { value: { trackInventory: true, stockOnHand: 0 } }
  return { value: { trackInventory: false, stockOnHand: 0 } }
}

/**
 * `_downloadable_files`: a serialized map of uuid → { name, file }. Some values have wrong string lengths (the URL was
 * changed without updating them); those are read by pattern instead and flagged with `repaired`.
 */
export function parseDownloadFiles(value: string | null | undefined): { files: { name: string | null; file: string }[]; repaired: boolean } {
  const text = value?.trim()
  if (!text || !looksSerialized(text)) return { files: [], repaired: false }
  let entries: unknown[]
  let repaired = false
  try {
    const parsed = phpUnserialize(text)
    entries = parsed !== null && typeof parsed === 'object' ? Object.values(parsed as Record<string, unknown>) : []
  } catch {
    repaired = true
    entries = [...text.matchAll(/s:4:"name";s:\d+:"([^"]*)";s:4:"file";s:\d+:"([^"]*)"/g)].map(([, name, file]) => ({ name, file }))
    if (!entries.length) throw new Error(`_downloadable_files: can't read ${text.slice(0, 80)}…`)
  }
  const files = entries.flatMap((entry) => {
    const { name, file } = (entry ?? {}) as { name?: unknown; file?: unknown }
    if (typeof file !== 'string' || !file.trim()) return []
    return [{ name: typeof name === 'string' && name.trim() ? name.trim() : null, file: file.trim() }]
  })
  return { files, repaired }
}

/** `_download_limit`: -1 or empty = unlimited (null). */
export function parseDownloadLimit(value: string | null | undefined): number | null {
  const limit = Number(value?.trim())
  return Number.isInteger(limit) && limit > 0 ? limit : null
}

/** Shop product names are what customers see in the cart, emails and invoices: no soft hyphens (§3.2). */
export const shopProductName = (title: string | null): string | null => title?.replace(/­|&shy;/g, '').trim() || null
