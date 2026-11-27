import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPayload } from 'payload'
import React, { cache } from 'react'

import config from '@/payload.config'
import { Post } from '@/components/Post/Post'
import { defaultLocale, getAlternates, isLocale, locales, type Locale } from '@/i18n'

// Render on every request, so changes from the admin show up immediately.
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ locale: string; slug: string }> }

// Same lookup as the event page: `slug` is localized, and the language switcher keeps the slug when it swaps
// /de/ <-> /en/. So a slug not found in the current language is looked up in the other languages too; the page then
// redirects to the current language's slug. A post without an English slug is shown in English under its German slug.
// `cache` makes generateMetadata and the page share the database queries.
const getPost = cache(async (slug: string, locale: Locale) => {
  const payload = await getPayload({ config })
  for (const lookupLocale of new Set([locale, defaultLocale, ...locales])) {
    const { docs } = await payload.find({
      collection: 'posts',
      where: { slug: { equals: slug }, visibility: { not_equals: 'hidden' } }, // hidden posts stay in the admin only
      select: {},
      depth: 0,
      limit: 1,
      locale: lookupLocale,
    })
    if (docs[0]) {
      return payload.findByID({ collection: 'posts', id: docs[0].id, depth: 1, locale })
    }
  }
  return null
})

// The post's path in every language, for hreflang. Empty English slugs fall back to German.
async function getPaths(id: number | string) {
  const payload = await getPayload({ config })
  const { slug } = (await payload.findByID({
    collection: 'posts',
    id,
    select: { slug: true },
    depth: 0,
    locale: 'all',
  })) as unknown as { slug?: Partial<Record<Locale, string | null>> }
  return Object.fromEntries(locales.map((l) => [l, `/news/${slug?.[l] || slug?.[defaultLocale]}`])) as Record<Locale, string>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const post = await getPost(slug, locale)
  if (!post) return {}
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    alternates: getAlternates(locale, await getPaths(post.id)),
  }
}

// Visit /de/news/<slug> or /en/news/<slug> to see this page.
export default async function PostPage(props: Props) {
  const { locale, slug } = await props.params
  if (!isLocale(locale)) notFound()

  const post = await getPost(slug, locale)
  if (!post) notFound()
  // Found under another language's slug: go to this language's slug.
  if (post.slug && post.slug !== slug) permanentRedirect(`/${locale}/news/${post.slug}`)

  return (
    <div className="post">
      <Post post={post} locale={locale} />
    </div>
  )
}
