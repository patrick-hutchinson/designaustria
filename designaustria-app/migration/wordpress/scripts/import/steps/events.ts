import { sql } from '@payloadcms/db-postgres'

import { EXTRACT_FILES, type ExtractedEvent } from '../../../lib/extract-types'
import { createHtmlToLexical } from '../../../lib/html-to-lexical'
import { MIGRATION_CONTEXT, upsertByLegacyKey } from '../../../lib/upsert'
import { idMap, readExtract, runItems, type ImportStep } from '../step'

// The German texts are written with the document, the English ones in a second update in the `en` locale
// (03-events-plan §4.2). Prices are an array with a localized label, so the English update passes the row IDs.
export const events: ImportStep = {
  name: 'events',
  // Events made by staff on the new site (no legacyWpId) are kept.
  wipe: { table: 'events', keep: sql`legacy_wp_id IS NULL` },
  async run({ payload, report, dryRun, resolve }) {
    const categoryIds = await idMap(payload, 'categories')
    const toLexical = await createHtmlToLexical(payload.config)
    const items = readExtract<ExtractedEvent>(EXTRACT_FILES.events)

    return runItems('events', items, report, async (event) => {
      const ref = `event ${event.legacyWpId}`
      const upserted = await upsertByLegacyKey({
        payload,
        collection: 'events',
        key: event.legacyWpId,
        locale: 'de',
        dryRun,
        data: {
          title: event.title.de,
          slug: event.slug.de,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          type: event.type,
          visibility: event.visibility,
          categories: resolve(categoryIds, event.categories, ref, 'category'),
          venue: { ...event.venue, name: event.venue.name.de },
          admission: {
            show: event.admission.show,
            prices: event.admission.prices.map((price) => ({ ...price, label: price.label.de })),
            note: event.admission.note.de,
          },
          openingHours: { show: event.openingHours.show, text: event.openingHours.text.de },
          notes: event.notes.de,
          links: event.links,
          badge: event.badge,
          description: toLexical(event.description.de),
          legacy: event.legacy,
        },
      })
      if (dryRun || !upserted.id || !event.title.en) return upserted

      const doc = await payload.findByID({ collection: 'events', id: upserted.id, locale: 'de', depth: 0 })
      const rows = doc.admission?.prices ?? []
      await payload.update({
        collection: 'events',
        id: upserted.id,
        locale: 'en',
        depth: 0,
        context: MIGRATION_CONTEXT,
        data: {
          title: event.title.en,
          slug: event.slug.en,
          venue: { name: event.venue.name.en },
          admission: {
            prices: rows.map((row, i) => ({ id: row.id, kind: row.kind, amount: row.amount, label: event.admission.prices[i]?.label.en ?? null })),
            note: event.admission.note.en,
          },
          openingHours: { text: event.openingHours.text.en },
          notes: event.notes.en,
          description: toLexical(event.description.en),
        },
      })
      return upserted
    }, (event) => `event ${event.legacyWpId}`)
  },
}
