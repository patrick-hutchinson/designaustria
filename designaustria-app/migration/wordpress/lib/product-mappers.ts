// Value mappers for products (Payload `products`), for now made from WordPress publications. Plan: docs/06-products-plan.md §3.1, §4.

import { parseStringList } from './ids'
import { cleanText, parseNumber, parseYear, type Mapped } from './mappers'

/** The `Publikationen` category (term 23). Every migrated publication is in it or one of its subcategories (§4.1). */
export const PUBLICATIONS_CATEGORY_ID = 23

/**
 * The publication's categories, with `Publikationen` added when none of them is in its tree (`added`). `inTree` tells
 * whether a term is Publikationen or one of its descendants.
 */
export function withPublicationsCategory(ids: number[], inTree: (id: number) => boolean): { ids: number[]; added: boolean } {
  if (ids.some(inTree)) return { ids, added: false }
  return { ids: [...ids, PUBLICATIONS_CATEGORY_ID], added: true }
}

/** `da_members_access`: `show` → the full page, `download` → the documents are for members only (§4.3). */
export function mapMembersAccess(value: string | null | undefined): { value: { content: boolean; documents: boolean }; unknown: string[] } {
  const values = parseStringList(value)
  return {
    value: { content: values.includes('show'), documents: values.includes('download') },
    unknown: values.filter((v) => v !== 'show' && v !== 'download'),
  }
}

/** ISBN / ISSN as typed, with non-breaking and repeated spaces made single spaces. */
export function normalizeIsbn(value: string | null | undefined): string | null {
  const text = cleanText(value)
  return text ? text.replace(/[\s ]+/g, ' ').trim() || null : null
}

/** Page count: a positive whole number. */
export function parsePages(value: string | null | undefined): Mapped<number> {
  const text = value?.trim()
  if (!text) return { value: null }
  const pages = parseNumber(text)
  return pages !== null && Number.isInteger(pages) && pages > 0 ? { value: pages } : { value: null, warning: `pages: invalid "${text}"` }
}

/** Publication year: four digits only ("92" isn't guessed, §3.1). */
export function parsePublicationYear(value: string | null | undefined): Mapped<number> {
  const text = value?.trim()
  if (text && !/^\d{4}$/.test(text)) return { value: null, warning: `year: invalid "${text}"` }
  return parseYear(text)
}

/** "Vorname Nachname" of a member post, or its title. */
export const memberName = (firstName: string | null | undefined, lastName: string | null | undefined, title: string | null | undefined): string | null =>
  [cleanText(firstName), cleanText(lastName)].filter(Boolean).join(' ') || cleanText(title)

/**
 * The free-text authors: the external ones (`da_publication_author_ext`) after the names of member authors that aren't
 * migrated. Names already in the external text aren't repeated.
 */
export function authorsText(unmigratedNames: string[], external: string | null | undefined): string | null {
  const ext = cleanText(external)
  const names = unmigratedNames.filter((name) => !ext?.toLowerCase().includes(name.toLowerCase()))
  return [...new Set(names), ...(ext ? [ext] : [])].join(', ') || null
}
