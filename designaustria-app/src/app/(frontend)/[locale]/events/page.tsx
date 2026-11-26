import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import config from '@/payload.config'
import { Event } from '@/components/Event/Event'
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
  // Placeholder until the real list (upcoming/past, filters, pagination) is built: newest 20.
  const { docs: events } = await payload.find({
    collection: 'events',
    where: { visibility: { not_equals: 'hidden' } }, // hidden events stay in the admin only
    sort: '-startsAt', // newest first
    limit: 20,
    locale, // 'de' or 'en', taken from the URL
  })

  return (
    <div className="events">
      <h1>{locale === 'de' ? 'Veranstaltungen' : 'Events'}</h1>
      {events.length === 0 && <p>No events yet — add one in the admin panel.</p>}
      {events.map((event) => (
        <Event key={event.id} event={event} locale={locale} />
      ))}
    </div>
  )
}
