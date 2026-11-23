import Link from 'next/link'

// Main navigation. Add more links here as pages are built.
export function Menu({ locale = 'de' }) {
  return (
    <nav className="menu">
      <Link href={`/${locale}/members`}>{locale === 'de' ? 'Mitglieder' : 'Members'}</Link>
      <Link href={`/${locale}/shop`}>Shop</Link>
    </nav>
  )
}
