import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import config from '@/payload.config'
import { Members } from '@/components/Members/Members'
import { getAlternates, isLocale } from '@/i18n'

// Render on every request, so profile changes from the admin show up immediately.
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return {
    title: locale === 'de' ? 'Mitglieder' : 'Members',
    alternates: getAlternates(locale, '/members'),
  }
}

// Visit /de/members or /en/members to see this page.
export default async function MembersPage(props: Props) {
  const { locale } = await props.params
  if (!isLocale(locale)) notFound()

  const payload = await getPayload({ config })

  // Members aren't readable by visitors (see access in src/collections/Members.ts).
  // The Local API skips access checks by default, so we must limit it ourselves:
  // only published profiles, and only the fields the list needs.
  const { docs: members } = await payload.find({
    collection: 'members',
    where: { profileStatus: { equals: 'publish' }, slug: { exists: true } },
    select: { fullName: true, slug: true },
    sort: 'fullName',
    pagination: false, // all of them, not just the first 10
    depth: 0,
    locale,
  })

  return (
    <div className="members">
      <h1>{locale === 'de' ? 'Mitglieder' : 'Members'}</h1>
      <Members members={members} locale={locale} />
    </div>
  )
}
