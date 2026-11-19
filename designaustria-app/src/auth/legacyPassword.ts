import type { CollectionAfterOperationHook, CollectionBeforeChangeHook, CollectionBeforeOperationHook } from 'payload'

import { verifyWordPressPassword } from './wordpressPassword'

// First login with a WordPress password (migration plan §6).
//
// Imported users get a random Payload password and keep their WordPress hash in `legacyPasswordHash`. On login,
// before Payload checks the password, this hook checks the WordPress hash. If the password matches, it becomes the
// user's Payload password and the hash is cleared, so Payload's normal login then succeeds. A wrong password
// changes nothing and goes through Payload's normal login, which fails and counts the attempt (lockout included).
// Runs inside Payload's login operation, so it covers the admin panel, REST, GraphQL and the Local API.
//
// Any new password (account settings, admin, "forgot password") also clears the WordPress hash, so an old
// WordPress password can never overwrite a password set on the new site.

export const LEGACY_PASSWORD_UPGRADE_CONTEXT = 'legacyPasswordUpgrade'

const retiredFields = () => ({ legacyPasswordHash: null, legacyPasswordRetiredAt: new Date().toISOString() })

export const upgradeWordPressPasswordOnLogin: CollectionBeforeOperationHook = async ({ args, collection, operation, req }) => {
  if (operation !== 'login') return args
  const { email, password } = (args.data ?? {}) as { email?: unknown; password?: unknown }
  if (typeof email !== 'string' || typeof password !== 'string' || password.trim() === '') return args

  // Same lookup as Payload's login (lowercased, trimmed email). The db adapter returns hidden fields too.
  const user = (await req.payload.db.findOne({
    collection: collection.slug,
    where: { email: { equals: email.toLowerCase().trim() } },
    req,
  })) as { id: number; legacyPasswordHash?: string | null; lockUntil?: string | null } | null

  if (!user?.legacyPasswordHash) return args
  if (user.lockUntil && new Date(user.lockUntil) > new Date()) return args // locked: let Payload refuse it
  if (!(await verifyWordPressPassword(password, user.legacyPasswordHash))) return args

  try {
    await req.payload.update({
      collection: collection.slug,
      id: user.id,
      data: { password, ...retiredFields() },
      overrideAccess: true,
      depth: 0,
      req,
      context: { [LEGACY_PASSWORD_UPGRADE_CONTEXT]: true },
    })
    req.payload.logger.info({ msg: 'WordPress password moved to Payload on first login', userId: user.id })
  } catch (error) {
    // Payload's own login still runs and fails; the user can use "forgot password".
    req.payload.logger.error({ err: error, msg: 'Could not move WordPress password to Payload', userId: user.id })
  }
  return args
}

/** A password set through update (account settings, admin) retires the WordPress hash. */
export const retireWordPressPasswordOnChange: CollectionBeforeChangeHook = ({ context, data, operation }) => {
  if (operation !== 'update' || context?.isMigration || typeof data?.password !== 'string' || !data.password) return data
  return { ...data, ...retiredFields() }
}

/** "Forgot password" writes the new hash straight to the database (no beforeChange), so retire it afterwards. */
export const retireWordPressPasswordOnReset: CollectionAfterOperationHook = async ({ collection, operation, req, result }) => {
  if (operation !== 'resetPassword') return result
  const userId = (result as { user?: { id?: number } } | undefined)?.user?.id
  if (userId) {
    await req.payload.update({
      collection: collection.slug,
      id: userId,
      data: retiredFields(),
      overrideAccess: true,
      depth: 0,
      req,
      context: { [LEGACY_PASSWORD_UPGRADE_CONTEXT]: true },
    })
  }
  return result
}
