import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import config from '@/payload.config'
import { isStaffUser } from '@/access/roles'
import { isLocale } from '@/i18n'
import { findOwnMember } from '@/members/ownProfile'
import { loginUrl } from '@/members/urls'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { robots: { index: false } }

type Props = { params: Promise<{ locale: string }> }

// /de/me: sends staff and admins to /admin, and a logged-in member to their own member page (where they can edit it).
// Used as the redirect after logging in and by the "Profile" link in the header.
export default async function MePage(props: Props) {
  const { locale } = await props.params
  if (!isLocale(locale)) notFound()

  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) redirect(loginUrl(locale))
  if (isStaffUser(user)) redirect('/admin')

  const member = await findOwnMember(payload, user, { select: { slug: true } })
  if (member?.slug) redirect(`/${locale}/member/${member.slug}`)

  const de = locale === 'de'
  return (
    <div className="profile">
      <h1>{de ? 'Profil' : 'Profile'}</h1>
      <p>
        {de
          ? 'Mit Ihrem Login ist noch kein Mitgliedsprofil verknüpft. Bitte wenden Sie sich an designaustria.'
          : 'No member profile is linked to your login yet. Please contact designaustria.'}
      </p>
    </div>
  )
}
