import styles from './Member.module.scss'

// Public profile of one member. Only shows entries marked "Public profile".
export function Member({ member, locale = 'de' }) {
  const de = locale === 'de'
  const isPublic = (entry) => entry.visibility === 'public'

  const addresses = (member.addresses ?? []).filter(isPublic)
  const phones = (member.phones ?? []).filter(isPublic)
  const portfolio = (member.portfolio ?? []).filter(isPublic)
  const links = (member.links ?? []).filter((link) => link.url)
  const categories = (member.categories ?? []).filter((c) => typeof c === 'object')
  const subtitle = [member.jobTitle, member.companyName].filter(Boolean).join(' · ')

  return (
    <article className={styles.member}>
      <h1>{member.fullName}</h1>
      {subtitle && <p>{subtitle}</p>}
      {member.motto && <blockquote>{member.motto}</blockquote>}

      {member.about && <Section title={de ? 'Über' : 'About'} text={member.about} />}
      {member.education && <Section title={de ? 'Ausbildung' : 'Education'} text={member.education} />}

      {categories.length > 0 && (
        <section>
          <h2>{de ? 'Schwerpunkte' : 'Focus areas'}</h2>
          <ul>
            {categories.map((category) => (
              <li key={category.id}>{category.title}</li>
            ))}
          </ul>
        </section>
      )}

      {portfolio.length > 0 && (
        <section>
          <h2>Portfolio</h2>
          <ul>
            {portfolio.map((project) => (
              <li key={project.id}>{project.name}</li>
            ))}
          </ul>
        </section>
      )}

      {(addresses.length > 0 || phones.length > 0 || links.length > 0 || member.contactEmailPublic) && (
        <section>
          <h2>{de ? 'Kontakt' : 'Contact'}</h2>
          {addresses.map((address) => (
            <address key={address.id}>
              {[address.street, address.number].filter(Boolean).join(' ')}
              <br />
              {[address.zip, address.city].filter(Boolean).join(' ')}
              {address.country && <>, {address.country}</>}
            </address>
          ))}
          <ul>
            {member.contactEmailPublic && member.contactEmail && (
              <li>
                <a href={`mailto:${member.contactEmail}`}>{member.contactEmail}</a>
              </li>
            )}
            {phones.map((phone) => (
              <li key={phone.id}>
                <a href={`tel:${phone.number}`}>{phone.number}</a>
              </li>
            ))}
            {links.map((link) => (
              <li key={link.id}>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}

function Section({ title, text }) {
  return (
    <section>
      <h2>{title}</h2>
      <p className={styles.text}>{text}</p>
    </section>
  )
}
