import { getPayload } from 'payload'
import React from 'react'

import config from '@/payload.config'
import { Event } from '@/components/Event/Event'

// Visit /events to see this page.
export default async function EventsPage() {
  const payload = await getPayload({ config })

  // Local API: queries the database directly (no HTTP request).
  const { docs: events } = await payload.find({
    collection: 'events',
    sort: 'date', // oldest first; use '-date' for newest first
    locale: 'de', // later this will come from the URL, e.g. /en/events
  })

  return (
    <div className="events">
      <h1>Events</h1>
      {events.length === 0 && <p>No events yet — add one in the admin panel.</p>}
      {events.map((event) => (
        <Event key={event.id} event={event} locale="de" />
      ))}
    </div>
  )
}
