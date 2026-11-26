import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPayload } from 'payload'
import React, { cache } from 'react'

import config from '@/payload.config'
import { Event } from '@/components/Event/Event'
import { defaultLocale, getAlternates, isLocale, locales, type Locale } from '@/i18n'

// Render on every request, so changes from the admin show up immediately.
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ locale: string; slug: string }> }

// `slug` is localized, and the language switcher keeps the slug when it swaps /de/ <-> /en/.
// So a slug not found in the current language is looked up in the other languages too; the page
// then redirects to the current language's slug. An event without an English slug is shown in
// English under its German slug (locale fallback).
// `cache` makes generateMetadata and the page share the database queries.
const getEvent = cache(async (slug: string, locale: Locale) => {
  const payload = await getPayload({ config })
  for (const lookupLocale of new Set([locale, defaultLocale, ...locales])) {
    const { docs } = await payload.find({
      collection: 'events',
      where: { slug: { equals: slug }, visibility: { not_equals: 'hidden' } }, // hidden events stay in the admin only
      select: {},
      depth: 0,
      limit: 1,
      locale: lookupLocale,
    })
    if (docs[0]) {
      return payload.findByID({ collection: 'events', id: docs[0].id, depth: 1, locale })
    }
  }
  return null
})

// The event's path in every language, for hreflang. Empty English slugs fall back to German.
async function getPaths(id: number | string) {
  const payload = await getPayload({ config })
  const { slug } = (await payload.findByID({
    collection: 'events',
    id,
    select: { slug: true },
    depth: 0,
    locale: 'all',
  })) as unknown as { slug?: Partial<Record<Locale, string | null>> }
  return Object.fromEntries(
    locales.map((l) => [l, `/events/${slug?.[l] || slug?.[defaultLocale]}`]),
  ) as Record<Locale, string>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const event = await getEvent(slug, locale)
  if (!event) return {}
  return {
    title: event.title,
    alternates: getAlternates(locale, await getPaths(event.id)),
  }
}

// Visit /de/events/<slug> or /en/events/<slug> to see this page.
export default async function EventPage(props: Props) {
  const { locale, slug } = await props.params
  if (!isLocale(locale)) notFound()

  const event = await getEvent(slug, locale)
  if (!event) notFound()
  // Found under another language's slug: go to this language's slug.
  if (event.slug && event.slug !== slug) permanentRedirect(`/${locale}/events/${event.slug}`)

  return (
    <div className="event">
      <Event event={event} locale={locale} />
    </div>
  )
}
