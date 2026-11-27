import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import config from '@/payload.config'
import { Posts } from '@/components/Posts/Posts'
import { getAlternates, isLocale } from '@/i18n'

// Render on every request, so new posts from the admin show up immediately
// (and the build doesn't need to query the database).
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ locale: string }> }

// <title>, canonical and hreflang tags for this page.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return {
    title: locale === 'de' ? 'Neues' : 'News',
    alternates: getAlternates(locale, '/news'),
  }
}

// Visit /de/news or /en/news to see this page.
export default async function PostsPage(props: Props) {
  const { locale } = await props.params
  if (!isLocale(locale)) notFound()

  const payload = await getPayload({ config })

  // Local API: queries the database directly (no HTTP request).
  // Only the fields the list needs. Filters and pagination are still to do.
  const { docs: posts } = await payload.find({
    collection: 'posts',
    // Hidden posts stay in the admin only. No filter on slug: in English, an empty slug falls back to the German one.
    where: { visibility: { not_equals: 'hidden' } },
    select: { title: true, slug: true, publishedAt: true },
    sort: '-publishedAt', // newest first
    pagination: false, // all of them, not just the first 10
    depth: 0,
    locale, // 'de' or 'en', taken from the URL
  })

  return (
    <div className="posts">
      <h1>{locale === 'de' ? 'Neues' : 'News'}</h1>
      <Posts posts={posts} locale={locale} />
    </div>
  )
}
