// Events (CPT `event`) with their ACF fields, categories, DE/EN translations and redirects. Plan: docs/03-events-plan.md.

import { viennaToUtc } from '../../lib/dates'
import {
  fixedOpeningHours,
  linesToText,
  mapAdmissionKind,
  mapEventType,
  mapVisibility,
  normalizeEventLink,
  parsePlace,
  splitImportText,
  type ParsedPlace,
} from '../../lib/event-mappers'
import type { ExtractedEvent, ExtractedEventPrice, ExtractedRedirect, Localized } from '../../lib/extract-types'
import { parseId, parseIdList } from '../../lib/ids'
import { cleanText } from '../../lib/mappers'
import { loadPostsWithMeta, query, type PostWithMeta, type WpConnection } from '../../lib/mysql'
import { loadPostLanguages, loadPostTranslations, loadTermTranslations, type Language } from '../../lib/polylang'
import { isEmptyRow, readRepeater } from '../../lib/repeater'
import type { Report } from '../../lib/report'
import { uniqueSlugs } from '../../lib/slugs'
import { cleanWpHtml, type CleanHtml } from '../../lib/wp-html'

const MIGRATED_STATUSES = new Set(['publish', 'private'])
const DETAILS = 'da_event_details_da_event_'

/** Old and new URL paths (03-events-plan §4.7). */
const oldPath = (locale: Language, slug: string) => `${locale === 'en' ? '/en' : ''}/veranstaltung/${slug}`
const newPath = (locale: Language, slug: string) => `/${locale}/events/${slug}`

/** The texts of one post (DE or EN), parsed the same way for both languages. */
interface PostTexts {
  title: string | null
  venue: ParsedPlace & { fromDetails: boolean }
  prices: ExtractedEventPrice[]
  admissionNote: string | null
  openingHours: string | null
  notes: string | null
  description: CleanHtml
  rawPlace: string | null
  rawCosts: string | null
}

export async function extractEvents(
  conn: WpConnection,
  report: Report,
): Promise<{ events: ExtractedEvent[]; redirects: ExtractedRedirect[]; source: number; notMigrated: Record<string, number> }> {
  const { posts, duplicateKeys } = await loadPostsWithMeta(conn, 'event')
  for (const { postId, key } of duplicateKeys) {
    if (!key.startsWith('_wp_old_')) report.warn('meta.duplicate-key', `event ${postId}`, `"${key}" stored more than once; newest value used`)
  }
  const content = new Map(
    (await query<{ ID: number; post_content: string }>(conn, `SELECT ID, post_content FROM wp_posts WHERE post_type = 'event'`)).map((row) => [
      row.ID,
      row.post_content,
    ]),
  )
  const languages = await loadPostLanguages(conn, 'event')
  const postTranslations = await loadPostTranslations(conn)
  const termTranslations = await loadTermTranslations(conn)
  const attachmentIdForUrl = await attachmentLookup(conn)
  const oldSlugs = await query<{ post_id: number; slug: string }>(
    conn,
    `SELECT m.post_id, m.meta_value AS slug FROM wp_postmeta m JOIN wp_posts p ON p.ID = m.post_id AND p.post_type = 'event'
     WHERE m.meta_key = '_wp_old_slug' AND m.meta_value <> '' ORDER BY m.post_id, m.meta_id`,
  )

  const byId = new Map(posts.map((post) => [post.post.ID, post]))
  const migrated = (id: number | undefined) => (id ? MIGRATED_STATUSES.has(byId.get(id)?.post.post_status ?? '') : false)
  const notMigrated: Record<string, number> = {}
  const skip = (reason: string) => (notMigrated[reason] = (notMigrated[reason] ?? 0) + 1)

  // 1. Pick the document posts: German posts, plus English ones without a migrated German partner.
  const documents: { main: PostWithMeta; en: PostWithMeta | null }[] = []
  for (const record of posts) {
    const { post } = record
    if (!MIGRATED_STATUSES.has(post.post_status)) {
      skip(post.post_status)
      continue
    }
    const language = languages.get(post.ID) ?? 'de'
    if (!languages.has(post.ID)) report.warn('event.no-language', `event ${post.ID}`, 'no Polylang language; treated as German')
    if (language === 'de') {
      const enId = postTranslations.englishOf.get(post.ID)
      if (enId && !migrated(enId)) {
        report.warn('event.en-not-migrated', `event ${post.ID}`, `English post ${enId} is ${byId.get(enId)?.post.post_status ?? 'missing'}; not used`)
      }
      documents.push({ main: record, en: enId && migrated(enId) ? byId.get(enId)! : null })
    } else if (!migrated(postTranslations.germanOf.get(post.ID))) {
      report.warn('event.english-only', `event ${post.ID}`, 'no German post; the English texts are copied to German')
      documents.push({ main: record, en: null })
    }
  }

  // 2. Map each document
  const events: ExtractedEvent[] = []
  for (const { main, en } of documents) {
    const { post, meta } = main
    const ref = `event ${post.ID}`
    const englishOnly = languages.get(post.ID) === 'en'

    const startsAt = report.mapped(ref, viennaToUtc(meta.da_event_from))
    if (!startsAt) {
      report.warn('event.no-start', ref, `no start date ("${meta.da_event_from ?? ''}"); not migrated`)
      skip('no start date')
      continue
    }
    let endsAt = report.mapped(ref, viennaToUtc(meta.da_event_to))
    if (endsAt && endsAt < startsAt) {
      report.warn('event.ends-before-start', ref, `ends ${meta.da_event_to} before it starts ${meta.da_event_from}; end left empty, fix by hand`)
      endsAt = null
    }

    const texts = readTexts(main, content.get(post.ID), attachmentIdForUrl, report)
    const enTexts = en ? readTexts(en, content.get(en.post.ID), attachmentIdForUrl, report) : null
    if (en) compareWithEnglish(main, en, report)

    // English-only events: the English texts are the document's, and German gets a copy (plan §4.2).
    const pick = <T>(de: T | null, english: T | null): Localized<T> => (englishOnly ? { de, en: de } : { de, en: english })
    const enLabels = enTexts && enTexts.prices.length === texts.prices.length ? enTexts.prices.map((p) => p.label.de) : null
    if (enTexts && enTexts.prices.length !== texts.prices.length && enTexts.prices.length) {
      report.warn('event.en-prices-differ', ref, `${texts.prices.length} German prices, ${enTexts.prices.length} English; English labels not used`)
    }

    const categories = [
      ...new Set(
        [...parseIdList(meta.da_category), ...(en ? parseIdList(en.meta.da_category) : [])].map((id) => termTranslations.germanOf.get(id) ?? id),
      ),
    ]
    const links = [
      ...new Set(
        readRepeater(meta, 'da_event_web')
          .map((row) => report.mapped(ref, normalizeEventLink(row.da_event_url)))
          .filter((url): url is string => url !== null),
      ),
    ].map((url) => ({ url, label: null }))
    const type = report.mapped(ref, mapEventType(meta.da_event_type))
    if (!type) report.warn('event.no-type', ref, `type "${meta.da_event_type ?? ''}"; set to internal`)

    events.push({
      legacyWpId: post.ID,
      title: pick(texts.title, enTexts?.title ?? null),
      slug: { de: post.post_name || null, en: englishOnly ? post.post_name || null : (en?.post.post_name ?? null) }, // made unique below
      startsAt,
      endsAt,
      type: type ?? 'internal',
      visibility: post.post_status === 'private' ? 'hidden' : report.mapped(ref, mapVisibility(meta.da_linked))!,
      categories,
      venue: {
        name: pick(texts.venue.name, enTexts?.venue.name ?? null),
        street: texts.venue.street,
        zip: texts.venue.zip,
        city: texts.venue.city,
        country: texts.venue.country,
      },
      admission: {
        show: meta[`${DETAILS}show_admission`] === undefined ? true : meta[`${DETAILS}show_admission`] === '1',
        prices: texts.prices.map((price, i) => ({ ...price, label: pick(price.label.de, enLabels?.[i] ?? null) })),
        note: pick(texts.admissionNote, enTexts?.admissionNote ?? null),
      },
      openingHours: {
        show: meta[`${DETAILS}show_open`] === undefined ? true : meta[`${DETAILS}show_open`] === '1',
        text: pick(texts.openingHours, enTexts?.openingHours ?? null),
      },
      notes: pick(texts.notes, enTexts?.notes ?? null),
      links,
      badge: cleanText(meta.da_badge_name),
      description: pick(texts.description.html, enTexts?.description.html ?? null),
      legacy: {
        wpStatus: post.post_status as 'publish' | 'private',
        enWpId: englishOnly ? post.ID : (en?.post.ID ?? null),
        productWpId: parseId(meta.da_product),
        imageWpIds: parseIdList(meta.da_images),
        inlineImageWpIds: [...new Set([...texts.description.inlineImageWpIds, ...(enTexts?.description.inlineImageWpIds ?? [])])],
        documentWpIds: [
          ...new Set(readRepeater(meta, 'da_documents').flatMap((row) => (isEmptyRow(row) ? [] : (parseId(row.da_document) ?? [])))),
        ],
        rawPlace: texts.rawPlace,
        rawCosts: texts.rawCosts,
      },
    })
  }

  // 3. Unique slugs per locale, and redirects for what the pattern rules don't cover
  const redirects: ExtractedRedirect[] = []
  for (const locale of ['de', 'en'] as const) {
    const withSlug = events.filter((event) => locale === 'de' || event.legacy.enWpId !== null) // others use the German slug
    const slugs = uniqueSlugs(withSlug.map((event) => ({ id: event.legacyWpId, slug: event.slug[locale], title: event.title[locale] })))
    for (const event of withSlug) {
      const { slug, changedFrom } = slugs.get(event.legacyWpId)!
      event.slug[locale] = slug
      if (changedFrom === undefined) continue
      report.warn('event.slug-changed', `event ${event.legacyWpId}`, `${locale} slug "${changedFrom ?? ''}" → "${slug}"`)
      if (changedFrom && event.visibility !== 'hidden') {
        redirects.push({ entity: 'event', legacyWpId: event.legacyWpId, locale, from: oldPath(locale, changedFrom), to: newPath(locale, slug), reason: 'slug-changed' })
      }
    }
  }
  const eventOfPost = new Map<number, { event: ExtractedEvent; locale: Language }>()
  for (const event of events) {
    const englishOnly = languages.get(event.legacyWpId) === 'en'
    eventOfPost.set(event.legacyWpId, { event, locale: englishOnly ? 'en' : 'de' })
    if (!englishOnly && event.legacy.enWpId) eventOfPost.set(event.legacy.enWpId, { event, locale: 'en' })
  }
  const current = { de: new Set(events.map((e) => e.slug.de)), en: new Set(events.map((e) => e.slug.en)) }
  const seen = new Set<string>()
  for (const { post_id, slug: old } of oldSlugs) {
    const target = eventOfPost.get(post_id)
    if (!target || target.event.visibility === 'hidden') continue
    const { event, locale } = target
    const slug = event.slug[locale]!
    const key = `${locale}:${old}`
    if (old === slug || seen.has(key)) continue
    if (current[locale].has(old)) {
      report.warn('event.old-slug-taken', `event ${event.legacyWpId}`, `old ${locale} slug "${old}" is now another event's slug; no redirect`)
      continue
    }
    seen.add(key)
    redirects.push({ entity: 'event', legacyWpId: event.legacyWpId, locale, from: oldPath(locale, old), to: newPath(locale, slug), reason: 'old-slug' })
  }
  redirects.sort((a, b) => a.locale.localeCompare(b.locale) || a.from.localeCompare(b.from))

  return { events, redirects, source: posts.length, notMigrated }
}

function readTexts(
  { post, meta }: PostWithMeta,
  html: string | undefined,
  attachmentIdForUrl: (url: string) => number | null,
  report: Report,
): PostTexts {
  const ref = `event ${post.ID}`
  const { place, costs, rest } = splitImportText(meta.da_event_import)

  // Venue: the structured fields if any are filled, otherwise the old free text.
  const detail = (key: string) => cleanText(meta[`${DETAILS}${key}`])
  const street = [detail('street'), detail('number')].filter(Boolean).join(' ') || null
  const structured = { name: detail('location'), street, zip: detail('zip'), city: detail('city') }
  const hasStructured = Object.values(structured).some(Boolean)
  const venue = hasStructured
    ? { ...structured, country: null, parsed: true, fromDetails: true }
    : { ...parsePlace(place), fromDetails: false }
  if (hasStructured && ((structured.zip && !/^\d{4,5}$/.test(structured.zip)) || (structured.city && /^\d{4,5}$/.test(structured.city)))) {
    report.warn('event.address-suspicious', ref, `zip "${structured.zip ?? ''}", city "${structured.city ?? ''}"; not corrected`)
  }
  if (!hasStructured && place && !venue.parsed) report.warn('event.place-unparsed', ref, 'place text went entirely to venue.name')

  // Prices: the repeater, or the older fixed fields.
  const prices: ExtractedEventPrice[] = []
  for (const row of readRepeater(meta, `${DETAILS}admission`)) {
    if (isEmptyRow(row)) continue
    const kind = report.mapped(ref, mapAdmissionKind(row.da_event_admission_type))
    const amount = cleanText(row.da_event_admission_amount)
    const title = cleanText(row.da_event_admission_title)
    if (!amount && !title) continue
    prices.push({ kind: kind ?? 'other', label: { de: title ?? (kind ? null : cleanText(row.da_event_admission_type)), en: null }, amount })
  }
  if (!prices.length) {
    for (const [key, kind] of [['full', 'regular'], ['reduced', 'reduced'], ['members', 'members']] as const) {
      const amount = cleanText(meta[`${DETAILS}admission_da_event_admission_${key}`])
      if (amount) prices.push({ kind, label: { de: null, en: null }, amount })
    }
  }

  const openingHours =
    linesToText(meta[`${DETAILS}open`]) ??
    fixedOpeningHours([
      {
        label: 'Mo–Fr',
        enabled: meta[`${DETAILS}open_weekday_da_event_open_weekday_bool`],
        from: meta[`${DETAILS}open_weekday_da_event_open_weekday_from`],
        to: meta[`${DETAILS}open_weekday_da_event_open_weekday_to`],
      },
      {
        label: 'Sa–So',
        enabled: meta[`${DETAILS}open_weekend_da_event_open_weekend_bool`],
        from: meta[`${DETAILS}open_weekend_da_event_open_weekend_from`],
        to: meta[`${DETAILS}open_weekend_da_event_open_weekend_to`],
      },
    ])

  const description = cleanWpHtml(html, { attachmentIdForUrl })
  for (const issue of description.issues) report.warn(`html.${issue.code}`, ref, issue.detail)

  return {
    title: cleanText(post.post_title),
    venue,
    prices,
    admissionNote: [linesToText(costs), linesToText(rest)].filter(Boolean).join('\n') || null,
    openingHours,
    notes: linesToText(meta[`${DETAILS}misc`]),
    description,
    rawPlace: place?.trim() || null,
    rawCosts: costs?.trim() || null,
  }
}

/** The English post's own dates and type are ignored; differences are logged so staff can check them (plan §4.2). */
function compareWithEnglish(de: PostWithMeta, en: PostWithMeta, report: Report) {
  for (const key of ['da_event_from', 'da_event_to', 'da_event_type'] as const) {
    const [a, b] = [de.meta[key]?.trim() ?? '', en.meta[key]?.trim() ?? '']
    if (a !== b) report.warn('event.en-differs', `event ${de.post.ID}`, `${key}: "${a}" (de) vs "${b}" (en ${en.post.ID}); German used`)
  }
}

/** Attachment ID for an uploads URL, via _wp_attached_file (also for resized copies like name-300x200.jpg). */
async function attachmentLookup(conn: WpConnection): Promise<(url: string) => number | null> {
  const rows = await query<{ post_id: number; file: string }>(
    conn,
    `SELECT post_id, meta_value AS file FROM wp_postmeta WHERE meta_key = '_wp_attached_file' ORDER BY post_id`,
  )
  const byFile = new Map<string, number>()
  for (const { post_id, file } of rows) if (!byFile.has(file)) byFile.set(file, post_id)
  return (url) => {
    const path = /\/wp-content\/uploads\/(.+)$/.exec(url.split(/[?#]/)[0])?.[1]
    if (!path) return null
    const file = decodeURIComponent(path)
    return byFile.get(file) ?? byFile.get(file.replace(/-\d+x\d+(\.\w+)$/, '$1')) ?? byFile.get(file.replace(/-scaled(\.\w+)$/, '$1')) ?? null
  }
}
