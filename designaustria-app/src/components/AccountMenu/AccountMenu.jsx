'use client' // runs in the browser, so pages can stay cached: the login state is fetched per visitor

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { loginUrl, meUrl } from '@/members/urls'

import styles from './AccountMenu.module.scss'

// The logged-in user with the name from their member profile (users.member is a join on members.user).
const ME_URL =
  '/api/users/me?depth=1&select[email]=true&select[member]=true&populate[members][fullName]=true&joins[member][limit]=1'

// Top right of the header: "Member login", or the member's avatar with a menu (profile, log out).
export function AccountMenu({ locale = 'de' }) {
  const de = locale === 'de'
  const router = useRouter()
  const [user, setUser] = useState(undefined) // undefined: still loading, null: logged out

  useEffect(() => {
    fetch(ME_URL, { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : {}))
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null))
  }, [])

  async function logout() {
    await fetch('/api/users/logout', { method: 'POST', credentials: 'include' })
    setUser(null)
    router.push(`/${locale}`)
    router.refresh()
  }

  if (user === undefined) return <div className={styles.placeholder} aria-hidden />

  if (!user) {
    return (
      <a className={styles.login} href={loginUrl(locale)}>
        {de ? 'Mitglieder-Login' : 'Member login'}
      </a>
    )
  }

  const name = user.member?.docs?.[0]?.fullName || user.email

  return (
    <div className={styles.account}>
      <button
        type="button"
        className={styles.avatar}
        aria-haspopup="true"
        aria-label={name}
        title={name}
      >
        {initials(name)}
      </button>
      <div className={styles.menu}>
        <Link href={meUrl(locale)}>{de ? 'Profil' : 'Profile'}</Link>
        <button type="button" onClick={logout}>
          {de ? 'Abmelden' : 'Log out'}
        </button>
      </div>
    </div>
  )
}

// "Mag. Anna Maria Berger" -> "AB", "anna@example.com" -> "A"
function initials(name) {
  const words = name
    .split('@')[0]
    .split(/\s+/)
    .filter((word) => word && !word.endsWith('.')) // skip academic titles like "Mag." or "Dr."
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words.slice(0, 1)
  return letters.map((word) => word[0].toUpperCase()).join('') || '?'
}
