// Runs the lib/ parsers over the whole loaded dump and reports values they can't handle.
// Read-only. Rerun on every new dump (the real one may contain data the anonymised one doesn't).
//
// Usage (from designaustria-app/): npx tsx migration/wordpress/scripts/analyze/check-helpers.ts

import { viennaToUtc } from '../../lib/dates'
import { mapAdmissionKind, mapEventType, mapVisibility as mapEventVisibility, normalizeEventLink, parsePlace, splitImportText } from '../../lib/event-mappers'
import { parseIdList } from '../../lib/ids'
import {
  mapAddressType,
  mapDocumentType,
  mapEmploymentType,
  mapLinkType,
  mapPaymentFrequency,
  mapPhoneType,
  mapSalutation,
  mapVisibility,
  normalizeCountry,
  normalizeUrl,
  parseDate,
  type Mapped,
} from '../../lib/mappers'
import { connectWp, query } from '../../lib/mysql'
import { looksSerialized, phpUnserialize } from '../../lib/php-unserialize'

const RELATION_KEYS = [
  'da_member_community',
  'da_member_community_admin',
  'da_member_user',
  'da_category',
  'da_member_avatar',
  'da_member_cert',
  'da_community_logo',
  'da_images',
  'da_product',
  '_thumbnail_id',
]

const MAPPERS: [RegExp, (v: string) => Mapped<unknown>][] = [
  [/^da_member_gender$/, mapSalutation],
  [/^da_member_job_type$/, mapEmploymentType],
  [/^da_member_payment_frequency$/, mapPaymentFrequency],
  [/^da_member_birthdate$/, parseDate],
  [/^da_address_\d+_da_address_type$/, mapAddressType],
  [/^da_(address|number|portfolio)_\d+_da_\1_show$/, mapVisibility],
  [/^da_address_\d+_da_address_country$/, normalizeCountry],
  [/^da_number_\d+_da_number_type$/, mapPhoneType],
  [/^da_online_\d+_da_online_type$/, mapLinkType],
  [/^da_online_\d+_da_online_link$/, normalizeUrl],
  [/^da_documents_\d+_da_document_type$/, mapDocumentType],
  // events and posts
  [/^da_event_type$/, mapEventType],
  [/^da_linked$/, mapEventVisibility],
  [/^da_event_details_da_event_admission_\d+_da_event_admission_type$/, mapAdmissionKind],
  [/^da_event_web_\d+_da_event_url$/, normalizeEventLink],
  [/^da_event_(from|to)$/, viennaToUtc],
]

async function main() {
  const conn = await connectWp()
  const rows = await query<{ post_id: number; post_type: string; meta_key: string; meta_value: string }>(
    conn,
    `SELECT m.post_id, p.post_type, m.meta_key, m.meta_value FROM wp_postmeta m
     JOIN wp_posts p ON p.ID = m.post_id
     WHERE p.post_type IN ('member', 'community', 'event', 'post', 'attachment') AND m.meta_value IS NOT NULL AND m.meta_value <> ''`,
  )

  let serialized = 0
  const unserializeFailures: string[] = []
  const relationFailures: string[] = []
  const mapperWarnings = new Map<string, number>()
  let places = 0
  const unparsedPlaces: string[] = []

  for (const row of rows) {
    if (looksSerialized(row.meta_value)) {
      serialized++
      try {
        phpUnserialize(row.meta_value)
      } catch (error) {
        unserializeFailures.push(`${row.post_type} ${row.post_id} ${row.meta_key}: ${(error as Error).message}`)
      }
    }
    if (row.post_type === 'attachment') continue
    if (RELATION_KEYS.includes(row.meta_key) || /^da_portfolio_\d+_da_portfolio_gallery$|^da_documents_\d+_da_document$/.test(row.meta_key)) {
      try {
        parseIdList(row.meta_value)
      } catch (error) {
        relationFailures.push(`${row.post_type} ${row.post_id} ${row.meta_key}: ${(error as Error).message}`)
      }
    }
    if (row.post_type === 'event' && row.meta_key === 'da_event_import') {
      const { place } = splitImportText(row.meta_value)
      if (place) {
        places++
        if (!parsePlace(place).parsed) unparsedPlaces.push(`event ${row.post_id}: ${place.replace(/\s+/g, ' ').slice(0, 100)}`)
      }
    }
    for (const [pattern, mapper] of MAPPERS) {
      if (!pattern.test(row.meta_key)) continue
      const { warning } = mapper(row.meta_value)
      if (warning) mapperWarnings.set(warning, (mapperWarnings.get(warning) ?? 0) + 1)
    }
  }
  await conn.end()

  console.log(`meta rows checked: ${rows.length}, serialized: ${serialized}`)
  console.log(`unserialize failures: ${unserializeFailures.length}`)
  unserializeFailures.slice(0, 20).forEach((line) => console.log(`  ${line}`))
  console.log(`relation parse failures: ${relationFailures.length}`)
  relationFailures.slice(0, 20).forEach((line) => console.log(`  ${line}`))
  console.log(`mapper warnings (distinct values): ${mapperWarnings.size}`)
  ;[...mapperWarnings].sort((a, b) => b[1] - a[1]).forEach(([warning, count]) => console.log(`  ${count}× ${warning}`))
  // Not a failure: these go entirely to venue.name (03-events-plan §4.4). A jump on a new dump means a new pattern.
  console.log(`event place texts the parser can't split: ${unparsedPlaces.length}/${places}`)
  unparsedPlaces.slice(0, 10).forEach((line) => console.log(`  ${line}`))

  if (unserializeFailures.length || relationFailures.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
