import Link from 'next/link'

import styles from './Members.module.scss'

// List of members, each linking to their profile at /<locale>/member/<slug>.
export function Members({ members, locale = 'de' }) {
  if (members.length === 0) {
    return <p>{locale === 'de' ? 'Noch keine Mitglieder.' : 'No members yet.'}</p>
  }

  return (
    <ul className={styles.list}>
      {members.map((member) => (
        <li key={member.id}>
          <Link href={`/${locale}/member/${member.slug}`}>{member.fullName}</Link>
        </li>
      ))}
    </ul>
  )
}
