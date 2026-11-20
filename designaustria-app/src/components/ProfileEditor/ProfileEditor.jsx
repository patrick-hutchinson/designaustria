'use client' // runs in the browser: opens/closes the form and shows the save result

import { useActionState, useState } from 'react'

import styles from './ProfileEditor.module.scss'

// Shown above a member's own profile page. `action` saves the form (see member/[slug]/actions.ts).
export function ProfileEditor({ action, values, isPublished, locale = 'de' }) {
  const de = locale === 'de'
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(action, { status: 'idle' })

  // After saving, React resets the form to its default values: use what was submitted,
  // so nothing typed gets lost when saving fails.
  const current = { ...values, ...state.values }

  return (
    <section className={styles.editor}>
      {!isPublished && (
        <p className={styles.notice}>
          {de
            ? 'Ihr Profil ist noch nicht öffentlich. Nur Sie sehen diese Seite.'
            : 'Your profile is not public yet. Only you can see this page.'}
        </p>
      )}

      {!open ? (
        <button type="button" onClick={() => setOpen(true)}>
          {de ? 'Profil bearbeiten' : 'Edit profile'}
        </button>
      ) : (
        <form action={formAction} className={styles.form}>
          <h2>{de ? 'Profil bearbeiten' : 'Edit profile'}</h2>

          <Text
            name="companyName"
            label={de ? 'Firmenname' : 'Company name'}
            value={current.companyName}
          />
          <Text
            name="jobTitle"
            label={de ? 'Berufsbezeichnung' : 'Job title'}
            value={current.jobTitle}
          />
          <Text name="about" label={de ? 'Über' : 'About'} value={current.about} multiline />
          <Text name="motto" label="Motto" value={current.motto} multiline />
          <Text
            name="education"
            label={de ? 'Ausbildung' : 'Education'}
            value={current.education}
            multiline
          />
          <Text
            name="contactEmail"
            label={de ? 'Kontakt-E-Mail' : 'Contact email'}
            value={current.contactEmail}
            type="email"
          />

          <label className={styles.checkbox}>
            <input
              type="checkbox"
              name="contactEmailPublic"
              defaultChecked={current.contactEmailPublic}
            />
            {de
              ? 'Kontakt-E-Mail im öffentlichen Profil zeigen'
              : 'Show contact email on public profile'}
          </label>

          <div className={styles.actions}>
            <button type="submit" disabled={pending}>
              {pending ? (de ? 'Speichern…' : 'Saving…') : de ? 'Speichern' : 'Save'}
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              {de ? 'Schließen' : 'Close'}
            </button>
            {state.message && (
              <p role="status" className={state.status === 'error' ? styles.error : undefined}>
                {state.message}
              </p>
            )}
          </div>
        </form>
      )}
    </section>
  )
}

function Text({ name, label, value, multiline = false, type = 'text' }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {multiline ? (
        <textarea name={name} defaultValue={value ?? ''} rows={4} />
      ) : (
        <input name={name} type={type} defaultValue={value ?? ''} />
      )}
    </label>
  )
}
