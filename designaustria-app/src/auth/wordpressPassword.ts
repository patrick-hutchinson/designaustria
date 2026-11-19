import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

import bcrypt from 'bcryptjs'

// Checks a password against a WordPress password hash, the same way wp_check_password() does (WordPress 7.1):
// - `$wp$2y$…`  WordPress ≥ 6.8: bcrypt over base64(HMAC-SHA384(password, 'wp-sha384'))
// - `$P$…`      phpass portable hashes (WordPress < 6.8, every hash in the current export)
// - `$2y$…`     plain bcrypt (plugins, or hashes set through password_hash())
// - 32 hex      plain MD5 (very old WordPress; WordPress itself still accepts it)
// Tested against hashes made by WordPress's own code: tests/int/wordpress-password.int.spec.ts.

export type WordPressHashKind = 'wp-bcrypt' | 'phpass' | 'bcrypt' | 'md5'

const MAX_PASSWORD_BYTES = 4096 // WordPress refuses longer passwords
const ITOA64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export function wordPressHashKind(hash: string): WordPressHashKind | null {
  if (hash.startsWith('$wp$2')) return 'wp-bcrypt'
  if (hash.startsWith('$P$') || hash.startsWith('$H$')) return 'phpass'
  if (/^\$2[aby]\$\d\d\$/.test(hash)) return 'bcrypt'
  if (/^[0-9a-f]{32}$/i.test(hash)) return 'md5'
  return null
}

export async function verifyWordPressPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash || typeof password !== 'string') return false
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) return false

  switch (wordPressHashKind(hash)) {
    case 'wp-bcrypt': {
      const prehashed = createHmac('sha384', 'wp-sha384').update(password, 'utf8').digest('base64')
      return bcrypt.compare(prehashed, hash.slice(3))
    }
    case 'bcrypt':
      return bcrypt.compare(password, hash)
    case 'phpass': {
      const computed = phpassCrypt(password, hash)
      return computed !== null && safeEqual(computed, hash)
    }
    case 'md5':
      return safeEqual(createHash('md5').update(password, 'utf8').digest('hex'), hash.toLowerCase())
    default:
      return false
  }
}

/** phpass crypt_private(): iterated, salted MD5. Returns null for a malformed hash. */
function phpassCrypt(password: string, setting: string): string | null {
  const countLog2 = ITOA64.indexOf(setting[3])
  if (countLog2 < 7 || countLog2 > 30) return null
  const salt = setting.slice(4, 12)
  if (salt.length !== 8) return null

  const pw = Buffer.from(password, 'utf8')
  const md5 = (data: Buffer) => createHash('md5').update(data).digest()
  let digest = md5(Buffer.concat([Buffer.from(salt, 'latin1'), pw]))
  for (let count = 1 << countLog2; count > 0; count--) digest = md5(Buffer.concat([digest, pw]))
  return setting.slice(0, 12) + encode64(digest, 16)
}

/** phpass encode64(): its own base64 variant (little-endian, ./0-9A-Za-z alphabet). */
function encode64(input: Buffer, count: number): string {
  let output = ''
  let i = 0
  do {
    let value = input[i++]
    output += ITOA64[value & 0x3f]
    if (i < count) value |= input[i] << 8
    output += ITOA64[(value >> 6) & 0x3f]
    if (i++ >= count) break
    if (i < count) value |= input[i] << 16
    output += ITOA64[(value >> 12) & 0x3f]
    if (i++ >= count) break
    output += ITOA64[(value >> 18) & 0x3f]
  } while (i < count)
  return output
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
