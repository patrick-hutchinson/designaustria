// Value mappers from WordPress/ACF strings to Payload field values.
// Convention: empty input → null. Unknown input → null plus a warning, so the extract report shows it.

export interface Mapped<T> {
  value: T | null
  warning?: string
}

// ── Text ────────────────────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  bdquo: '„',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  eacute: 'é',
  egrave: 'è',
  copy: '©',
  reg: '®',
  euro: '€',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match
    }
    return NAMED_ENTITIES[entity] ?? match
  })
}

/** Decodes HTML entities and trims. Empty → null. Line breaks inside are kept (textareas). */
export function cleanText(value: string | null | undefined): string | null {
  if (value == null) return null
  const text = decodeEntities(value).replace(/\r\n/g, '\n').trim()
  return text === '' ? null : text
}

// ── Enums ───────────────────────────────────────────────────────────────────

const mapEnum =
  <T extends string>(field: string, table: Record<string, T>) =>
  (value: string | null | undefined): Mapped<T> => {
    const key = value?.trim()
    if (!key) return { value: null }
    const mapped = table[key] ?? table[key.toLowerCase()]
    return mapped ? { value: mapped } : { value: null, warning: `${field}: unknown value "${key}"` }
  }

export const mapSalutation = mapEnum('salutation', { d: 'd', f: 'f', m: 'm', i: 'i' } as const)

export const mapEmploymentType = mapEnum('employmentType', {
  angestellt: 'employed',
  selbstständig: 'selfEmployed',
  selbststaendig: 'selfEmployed',
} as const)

export const mapPaymentType = mapEnum('paymentType', { sepa: 'sepa' } as const)

export const mapPaymentFrequency = mapEnum('paymentFrequency', { year: 'yearly', trimester: 'quarterly' } as const)

export const mapLinkType = mapEnum('links.type', {
  web: 'web',
  website: 'web',
  instagram: 'instagram',
  facebook: 'facebook',
  behance: 'behance',
  linkedin: 'linkedin',
  twitter: 'x',
  'x (twitter)': 'x',
  x: 'x',
  xing: 'xing',
  blog: 'blog',
} as const)

export const mapPhoneType = mapEnum('phones.type', { office: 'office', mobile: 'mobile', fax: 'fax' } as const)

export const mapAddressType = mapEnum('addresses.type', { office: 'office', private: 'private' } as const)

export const mapVisibility = mapEnum('visibility', { public: 'public', private: 'private' } as const)

export const mapDocumentType = mapEnum('documents.type', {
  dissertation: 'dissertation',
  thesis: 'thesis',
  paper: 'paper',
  publication: 'publication',
  book: 'book',
  misc: 'misc',
} as const)

export const mapPartnerStatus = mapEnum('partnerStatus', {
  partner: 'partner',
  premium: 'premium',
  education: 'education',
} as const)

export const mapDisplayOptIn = mapEnum('displayOptIns', { email: 'email', frontpage: 'frontpage' } as const)

/** WordPress post_status → profileStatus. `auto-draft`/`trash`/… → null. Only `publish` is migrated (lib/published.ts). */
export const mapProfileStatus = mapEnum('profileStatus', {
  publish: 'publish',
  pending: 'pending',
  draft: 'draft',
  private: 'private',
} as const)

// ── Specific values ─────────────────────────────────────────────────────────

/** "000000" and "000000-N" are placeholders for "no member number". */
export function memberNumber(value: string | null | undefined): string | null {
  const text = value?.trim()
  if (!text || /^0{6}(-\d+)?$/.test(text)) return null
  return text
}

const COUNTRY_ALIASES: Record<string, string> = {
  a: 'AT',
  aut: 'AT',
  austria: 'AT',
  österreich: 'AT',
  oesterreich: 'AT',
  ö: 'AT',
  wien: 'AT',
  vienna: 'AT',
  // Austrian states sometimes entered as the country
  burgenland: 'AT',
  kärnten: 'AT',
  niederösterreich: 'AT',
  oberösterreich: 'AT',
  salzburg: 'AT',
  steiermark: 'AT',
  tirol: 'AT',
  vorarlberg: 'AT',
  d: 'DE',
  deu: 'DE',
  deutschland: 'DE',
  germany: 'DE',
  schweiz: 'CH',
  switzerland: 'CH',
  italien: 'IT',
  italy: 'IT',
  frankreich: 'FR',
  france: 'FR',
  uk: 'GB',
  'united kingdom': 'GB',
  england: 'GB',
  niederlande: 'NL',
  netherlands: 'NL',
  ungarn: 'HU',
  tschechien: 'CZ',
  slowenien: 'SI',
  usa: 'US',
  russia: 'RU',
  russland: 'RU',
  ägypten: 'EG',
  egypt: 'EG',
  morocco: 'MA',
  marokko: 'MA',
}

/** Free-text country → ISO 3166 alpha-2. Two-letter codes pass through (upper-cased). */
export function normalizeCountry(value: string | null | undefined): Mapped<string> {
  const text = value?.trim()
  if (!text || /^[-–.]+$/.test(text)) return { value: null }
  if (/^[a-z]{2}$/i.test(text)) return { value: text.toUpperCase() }
  const lower = text.toLowerCase()
  // Typos of Österreich seen in the dump: Östereich, Österrich, Österreicj …
  if (/^(ö|oe|o)ster/.test(lower)) return { value: 'AT' }
  const code = COUNTRY_ALIASES[lower]
  return code ? { value: code } : { value: null, warning: `country: unmapped value "${text}"` }
}

/** Adds https:// where the scheme is missing. Invalid → null + warning. */
export function normalizeUrl(value: string | null | undefined): Mapped<string> {
  const text = value?.trim()
  if (!text) return { value: null }
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text.replace(/^\/+/, '')}`
  try {
    const url = new URL(candidate)
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) throw new Error('not a web URL')
    return { value: url.toString() }
  } catch {
    return { value: null, warning: `url: invalid "${text}"` }
  }
}

/** ACF date_picker value ("Y-m-d" or "Ymd") → ISO timestamp at noon UTC (no day shift in any timezone). */
export function parseDate(value: string | null | undefined): Mapped<string> {
  const text = value?.trim()
  if (!text) return { value: null }
  const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(text)
  if (!match || match[1] === '0000') return { value: null, warning: `date: invalid "${text}"` }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12))
  if (date.getUTCMonth() !== Number(match[2]) - 1) return { value: null, warning: `date: invalid "${text}"` }
  return { value: date.toISOString() }
}

/**
 * WordPress post dates. post_date_gmt is UTC but is "0000-00-00 00:00:00" for some drafts;
 * then post_date (site-local time) is used as if it were UTC (off by 1–2 hours at most).
 */
export function wpPostDate(gmt: string | null | undefined, local: string | null | undefined): string | null {
  for (const value of [gmt, local]) {
    if (value && !value.startsWith('0000')) return new Date(`${value.replace(' ', 'T')}Z`).toISOString()
  }
  return null
}

export function parseYear(value: string | null | undefined): Mapped<number> {
  const text = value?.trim()
  if (!text || text === '0') return { value: null }
  const year = Number(text)
  return Number.isInteger(year) && year >= 1800 && year <= 2100 ? { value: year } : { value: null, warning: `year: invalid "${text}"` }
}

export function parseNumber(value: string | null | undefined): number | null {
  const text = value?.trim()
  if (!text) return null
  const number = Number(text.replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

export const parseBool = (value: string | null | undefined): boolean => value?.trim() === '1' || value?.trim() === 'true'
