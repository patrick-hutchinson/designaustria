// Value mappers for WordPress events (CPT `event`). Plan: docs/03-events-plan.md §4.
// Same convention as mappers.ts: empty → null, unknown → null + warning.

import { decodeEntities, normalizeCountry, normalizeUrl, type Mapped } from './mappers'

// ── Old free text (da_event_import, 2011–2020) ──────────────────────────────

/** Splits `…<!--place-->…<!--costs-->…` on its markers. Text before the first marker is `rest`. */
export function splitImportText(raw: string | null | undefined): { place: string | null; costs: string | null; rest: string | null } {
  const text = raw ?? ''
  const part = (marker: string) => {
    const start = text.indexOf(marker)
    if (start < 0) return null
    const from = start + marker.length
    const next = text.indexOf('<!--', from)
    return text.slice(from, next < 0 ? undefined : next)
  }
  const first = text.search(/<!--(place|costs)-->/)
  const rest = first < 0 ? text : text.slice(0, first)
  const clean = (value: string | null) => (value && htmlToLines(value).length ? value : null)
  return { place: clean(part('<!--place-->')), costs: clean(part('<!--costs-->')), rest: clean(rest) }
}

/** HTML or plain text → its lines: <br>, <p>, <div> and newlines break lines; other tags are removed. */
export function htmlToLines(html: string): string[] {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(p|div|li|h[1-6])(\s[^>]*)?>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\r\n?/g, '\n')
    .replace(/\\n/g, '\n') // literal "\n" in some ACF values
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

export const linesToText = (html: string | null | undefined): string | null => {
  const lines = html ? htmlToLines(html) : []
  return lines.length ? lines.join('\n') : null
}

const COUNTRY_PREFIX: Record<string, string> = { A: 'AT', D: 'DE', CH: 'CH', I: 'IT', H: 'HU', SLO: 'SI', CZ: 'CZ' }
const POSTCODE_LINE = /^(?:([A-Z]{1,3})-)?(\d{4,5})\s+(.+)$/
const STREET_AND_POSTCODE = /^(.+?),\s*(?:([A-Z]{1,3})-)?(\d{4,5})\s+(.+)$/

export interface ParsedPlace {
  name: string | null
  street: string | null
  zip: string | null
  city: string | null
  country: string | null
  /** false when the text didn't match the name / street / postcode city pattern and all of it went to `name` */
  parsed: boolean
}

/**
 * Old free-text place → venue (plan §4.4). Line 1 is the name. A last line starting with a postcode is zip + city,
 * and the line before it the street ("Hauptstraße 1, 1070 Wien" on one line works too). Other lines are added to the name.
 */
export function parsePlace(html: string | null | undefined): ParsedPlace {
  let lines = (html ? htmlToLines(html) : []).map((line) => line.replace(/\s*[,;]$/, '')).filter(Boolean)
  // Everything on one line, "MAK, Stubenring 5, 1010 Wien": read the comma-separated parts as lines.
  if (lines.length === 1) {
    const parts = lines[0].split(/\s*,\s*/)
    if (parts.length >= 2 && POSTCODE_LINE.test(parts[parts.length - 1])) {
      lines = parts.length === 2 ? parts : [parts.slice(0, -2).join(', '), ...parts.slice(-2)]
    }
  }
  const empty: ParsedPlace = { name: null, street: null, zip: null, city: null, country: null, parsed: false }
  if (!lines.length) return empty
  // A last line that is only a country ("Deutschland", "Österreich") is taken off first.
  const countryLine = lines.length >= 3 && !/\d/.test(lines[lines.length - 1]) ? normalizeCountry(lines[lines.length - 1]).value : null
  if (countryLine) lines.pop()
  const last = lines[lines.length - 1]
  const country = (prefix: string | undefined) => (prefix ? (COUNTRY_PREFIX[prefix] ?? countryLine) : countryLine)
  const joinName = (nameLines: string[]) => nameLines.map((line) => line.replace(/\s*[,;]$/, '')).join('\n') || null

  const postcode = lines.length >= 2 ? POSTCODE_LINE.exec(last) : null
  if (postcode) {
    const [, prefix, zip, city] = postcode
    const street = lines.length >= 3 ? lines[lines.length - 2] : null
    const nameLines = lines.slice(0, street ? -2 : -1)
    return { name: joinName(nameLines), street, zip, city, country: country(prefix), parsed: true }
  }
  const combined = lines.length >= 2 ? STREET_AND_POSTCODE.exec(last) : null
  if (combined) {
    const [, street, prefix, zip, city] = combined
    return { name: joinName(lines.slice(0, -1)), street, zip, city, country: country(prefix), parsed: true }
  }
  return { ...empty, name: (html ? htmlToLines(html) : []).join('\n') }
}

// ── Structured details (da_event_details, from 2021) ────────────────────────

export type AdmissionKind = 'regular' | 'reduced' | 'members' | 'other'

const ADMISSION_KINDS: Record<string, AdmissionKind> = {
  normpreis: 'regular',
  regulär: 'regular',
  regular: 'regular',
  ermäßigt: 'reduced',
  'ermäßigt für designaustria-mitglieder': 'members',
  sonstige: 'other',
}

export function mapAdmissionKind(value: string | null | undefined): Mapped<AdmissionKind> {
  const key = value?.trim().toLowerCase()
  if (!key) return { value: null }
  const kind = ADMISSION_KINDS[key]
  return kind ? { value: kind } : { value: null, warning: `admission.kind: unknown value "${value!.trim()}"` }
}

export function mapEventType(value: string | null | undefined): Mapped<'internal' | 'external'> {
  const key = value?.trim()
  if (key === 'intern') return { value: 'internal' }
  if (key === 'extern') return { value: 'external' }
  return key ? { value: null, warning: `event.type: unknown value "${key}"` } : { value: null }
}

/** da_linked; missing or empty (older events) means everywhere. */
export function mapVisibility(value: string | null | undefined): Mapped<'everywhere' | 'notOnHome' | 'hidden'> {
  const key = value?.trim()
  if (!key || key === 'all') return { value: 'everywhere' }
  if (key === 'nostart') return { value: 'notOnHome' }
  if (key === 'none') return { value: 'hidden' }
  return { value: 'everywhere', warning: `event.visibility: unknown value "${key}"` }
}

const hhmm = (time: string | null | undefined) => /^(\d{1,2}):(\d{2})/.exec(time?.trim() ?? '')?.slice(1, 3).map((part, i) => (i === 0 ? part.padStart(2, '0') : part)).join(':') ?? null

/** The older variant's fixed opening hours, written out: "Mo–Fr 10:00–18:00\nSa–So 13:00–18:00". Only rows with bool = 1. */
export function fixedOpeningHours(rows: { label: string; enabled: string | undefined; from: string | undefined; to: string | undefined }[]): string | null {
  const lines = rows.flatMap(({ label, enabled, from, to }) => {
    const [start, end] = [hhmm(from), hhmm(to)]
    if (enabled?.trim() !== '1' || !start) return []
    return [`${label} ${start}${end ? `–${end}` : ''}`]
  })
  return lines.length ? lines.join('\n') : null
}

// ── Links (da_event_web) ────────────────────────────────────────────────────

/** Web link or mailto:. Fixes entity-encoded and mangled forms seen in the dump, e.g. "/&lt;http:/www.x.at/&gt;". */
export function normalizeEventLink(value: string | null | undefined): Mapped<string> {
  let text = decodeEntities(value ?? '').trim()
  if (!text) return { value: null }
  text = text
    .replace(/^\/?<|>\/?$/g, '')
    .replace(/^(https?):\/(?!\/)/i, '$1://')
    .replace(/^(https?:\/\/)\s+/i, '$1')
    .trim()
  if (/^mailto:/i.test(text)) {
    return /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(text) ? { value: text } : { value: null, warning: `url: invalid "${value}"` }
  }
  if (/^[^\s@/]+@[^\s@]+\.[^\s@]+$/.test(text)) return { value: `mailto:${text}` }
  return normalizeUrl(text)
}
