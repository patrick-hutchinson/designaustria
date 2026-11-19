// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { verifyWordPressPassword, wordPressHashKind } from '@/auth/wordpressPassword'

import vectors from '../fixtures/wordpress-password-hashes.json'

// The fixture was made with WordPress's own code (class-phpass.php and the wp_hash_password() bcrypt scheme of
// WordPress 7.1, PHP 8.4), so these tests check against WordPress itself, not against our reading of it.
// Test passwords only; no real hashes.

describe('verifyWordPressPassword', () => {
  it.each(vectors)('accepts the right password ($kind, "$password")', async ({ password, hash, kind }) => {
    expect(wordPressHashKind(hash)).toBe(kind)
    expect(await verifyWordPressPassword(password, hash)).toBe(true)
  })

  it.each(vectors)('rejects a wrong password ($kind, "$password")', async ({ password, hash }) => {
    expect(await verifyWordPressPassword(`${password}x`, hash)).toBe(false)
    expect(await verifyWordPressPassword(password.toUpperCase() === password ? password.toLowerCase() : password.toUpperCase(), hash)).toBe(false)
    expect(await verifyWordPressPassword('', hash)).toBe(false)
  })

  it('does not trim, like WordPress', async () => {
    const spaced = vectors.find((v) => v.kind === 'phpass' && v.password.startsWith(' '))!
    expect(await verifyWordPressPassword(spaced.password.trim(), spaced.hash)).toBe(false)
  })

  it('rejects missing, unknown and malformed hashes', async () => {
    expect(await verifyWordPressPassword('x', null)).toBe(false)
    expect(await verifyWordPressPassword('x', '')).toBe(false)
    expect(await verifyWordPressPassword('x', '$argon2id$v=19$m=65536,t=4,p=1$abc$def')).toBe(false)
    expect(await verifyWordPressPassword('x', '$P$')).toBe(false)
    expect(await verifyWordPressPassword('x', '$P$!short')).toBe(false)
  })

  it('rejects passwords over 4096 bytes, like WordPress', async () => {
    const md5 = vectors.find((v) => v.kind === 'md5')!
    expect(await verifyWordPressPassword(md5.password + ' '.repeat(4097), md5.hash)).toBe(false)
  })
})
