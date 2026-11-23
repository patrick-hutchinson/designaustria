import Link from 'next/link'

import styles from './Menu.module.scss'

// Main navigation. Add more links here as pages are built.
export function Menu({ locale = 'de', setOpen }) {
  return (
    <div className={styles.menu}>
      <button className={styles.closeMenu} onClick={() => setOpen(false)}>
        Close
      </button>
      <nav className={styles.nav}>
        <Link href={`/${locale}/members`}>{locale === 'de' ? 'Mitglieder' : 'Members'}</Link>
        <Link href={`/${locale}/events`}>{locale === 'de' ? 'Veranstaltungen' : 'Events'}</Link>
        <Link href={`/${locale}/about`}>About</Link>
      </nav>
    </div>
  )
}
