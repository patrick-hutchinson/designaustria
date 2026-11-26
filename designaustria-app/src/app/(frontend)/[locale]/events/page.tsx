import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import config from '@/payload.config'
import { Events } from '@/components/Events/Events'
import { getAlternates, isLocale } from '@/i18n'

// Render on every request, so new events from the admin show up immediately
// (and the build doesn't need to query the database).
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ locale: string }> }

// <title>, canonical and hreflang tags for this page.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return {
    title: locale === 'de' ? 'Veranstaltungen' : 'Events',
    alternates: getAlternates(locale, '/events'),
  }
}

// Visit /de/events or /en/events to see this page.
export default async function EventsPage(props: Props) {
  const { locale } = await props.params
  if (!isLocale(locale)) notFound()

  const payload = await getPayload({ config })

  // Local API: queries the database directly (no HTTP request).
  // Only the fields the list needs. Upcoming/past, filters and pagination are still to do.
  const { docs: events } = await payload.find({
    collection: 'events',
    // Hidden events stay in the admin only. No filter on slug: in English, an empty slug falls back to the German one.
    where: { visibility: { not_equals: 'hidden' } },
    select: { title: true, slug: true },
    sort: '-startsAt', // newest first
    pagination: false, // all of them, not just the first 10
    depth: 0,
    locale, // 'de' or 'en', taken from the URL
  })

  return (
    <div className="events">
      <h1>{locale === 'de' ? 'Veranstaltungen' : 'Events'}</h1>
      <Events events={events} locale={locale} />
    </div>
  )
}
