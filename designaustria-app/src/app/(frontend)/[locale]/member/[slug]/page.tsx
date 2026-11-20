import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import React, { cache } from 'react'

import config from '@/payload.config'
import { Member } from '@/components/Member/Member'
import { getAlternates, isLocale, type Locale } from '@/i18n'

// Render on every request, so profile changes from the admin show up immediately.
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ locale: string; slug: string }> }

// Members aren't readable by visitors (see access in src/collections/Members.ts).
// The Local API skips access checks by default, so we must limit it ourselves:
// only published profiles, and only fields that may be public.
// Entries marked "designaustria only" (addresses, phones, portfolio) are filtered in <Member>.
// `cache` makes generateMetadata and the page share one database query.
const getMember = cache(async (slug: string, locale: Locale) => {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'members',
    where: { slug: { equals: slug }, profileStatus: { equals: 'publish' } },
    select: {
      fullName: true,
      slug: true,
      companyName: true,
      jobTitle: true,
      about: true,
      motto: true,
      education: true,
      categories: true,
      addresses: true,
      phones: true,
      links: true,
      portfolio: true,
      contactEmail: true,
      contactEmailPublic: true,
    },
    populate: { categories: { title: true } },
    depth: 1, // turn category IDs into { title }
    limit: 1,
    locale,
  })
  return docs[0] ?? null
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const member = await getMember(slug, locale)
  if (!member) return {}
  return {
    title: member.fullName,
    alternates: getAlternates(locale, `/member/${slug}`),
  }
}

// Visit /de/member/<slug> or /en/member/<slug> to see this page.
export default async function MemberPage(props: Props) {
  const { locale, slug } = await props.params
  if (!isLocale(locale)) notFound()

  const member = await getMember(slug, locale)
  if (!member) notFound()

  return (
    <div className="member">
      <Member member={member} locale={locale} />
    </div>
  )
}
