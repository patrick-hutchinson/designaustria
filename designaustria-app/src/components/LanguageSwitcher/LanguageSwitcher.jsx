'use client' // runs in the browser, because it needs the current URL

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { locales } from '@/i18n'

import styles from './LanguageSwitcher.module.scss'

// Links to the same page in every language: /de/events <-> /en/events
export function LanguageSwitcher() {
  const pathname = usePathname() // e.g. "/de/events"
  const [, current, ...rest] = pathname.split('/')

  return (
    <nav className={styles['language-switcher']}>
      {locales.map((locale) => (
        <Link
          key={locale}
          href={`/${[locale, ...rest].join('/')}`}
          aria-current={locale === current ? 'page' : undefined}
        >
          {locale.toUpperCase()}
        </Link>
      ))}
    </nav>
  )
}
