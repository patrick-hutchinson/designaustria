'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getPayload, ValidationError } from 'payload'

import config from '@/payload.config'
import { EDITABLE_TEXT_FIELDS, updateOwnProfile, type OwnProfileInput } from '@/members/ownProfile'

// Field names as shown in the form, for error messages.
const LABELS: Record<string, [de: string, en: string]> = {
  companyName: ['Firmenname', 'Company name'],
  jobTitle: ['Berufsbezeichnung', 'Job title'],
  about: ['Über', 'About'],
  motto: ['Motto', 'Motto'],
  education: ['Ausbildung', 'Education'],
  contactEmail: ['Kontakt-E-Mail', 'Contact email'],
}

export type ProfileFormState = {
  status: 'idle' | 'saved' | 'error'
  message?: string
  values?: OwnProfileInput // what was submitted, so the form keeps it after an error
}

// Saves the profile form on the member page. Only ever edits the logged-in member's own profile.
export async function saveOwnProfile(
  locale: string,
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const de = locale === 'de'
  const values: OwnProfileInput = {
    contactEmailPublic: formData.get('contactEmailPublic') === 'on',
  }
  for (const field of EDITABLE_TEXT_FIELDS) {
    const value = formData.get(field)
    if (typeof value === 'string') values[field] = value
  }

  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) {
    return {
      status: 'error',
      values,
      message: de ? 'Bitte melden Sie sich erneut an.' : 'Please log in again.',
    }
  }

  try {
    const member = await updateOwnProfile(payload, user, values)
    if (member.slug) revalidatePath(`/${locale}/member/${member.slug}`)
    return { status: 'saved', values, message: de ? 'Gespeichert.' : 'Saved.' }
  } catch (error) {
    if (error instanceof ValidationError) {
      const fields = error.data.errors.map((e) => LABELS[e.path]?.[de ? 0 : 1] ?? e.path).join(', ')
      return {
        status: 'error',
        values,
        message: (de ? 'Bitte prüfen Sie: ' : 'Please check: ') + fields,
      }
    }
    payload.logger.error({ err: error, msg: 'Could not save own profile', userId: user.id })
    return {
      status: 'error',
      values,
      message: de ? 'Speichern fehlgeschlagen.' : 'Could not save.',
    }
  }
}
