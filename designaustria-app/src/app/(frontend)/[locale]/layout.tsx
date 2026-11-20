import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import React from 'react'

import { AccountMenu } from '@/components/AccountMenu/AccountMenu'
import { LanguageSwitcher } from '@/components/LanguageSwitcher/LanguageSwitcher'
import { Menu } from '@/components/Menu/Menu'
import { isLocale, locales } from '@/i18n'
import '../styles.css'

// Base URL for canonical/hreflang links, which must be absolute.
// On Vercel this is the production domain (also on previews, so search engines
// always point to the live site); locally it's localhost.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  description: 'A blank template using Payload in a Next.js app.',
  title: 'Payload Blank Template',
}

// Tell Next.js which values [locale] can have.
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default async function RootLayout(props: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { children } = props
  const { locale } = await props.params

  // /fr/... or any other unknown language -> 404
  if (!isLocale(locale)) notFound()

  return (
    <html lang={locale}>
      <body>
        <header className="header">
          <Menu locale={locale} />
          <LanguageSwitcher />
          <AccountMenu locale={locale} />
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
