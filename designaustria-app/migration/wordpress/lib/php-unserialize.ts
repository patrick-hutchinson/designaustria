// Minimal parser for PHP's serialize() format, as WordPress/ACF store it in wp_postmeta.
// Supports N, b, i, d, s and a (arrays). Objects (O:) don't occur in the fields we migrate.
//
// String lengths in the format are *byte* lengths (UTF-8), so parsing works on a Buffer,
// otherwise any value with ä/ö/ü/ß would be cut in the wrong place.

export type PhpValue = null | boolean | number | string | PhpValue[] | { [key: string]: PhpValue }

export class PhpUnserializeError extends Error {
  constructor(message: string, readonly input: string, readonly position: number) {
    super(`${message} at byte ${position}: ${input.slice(0, 80)}${input.length > 80 ? '…' : ''}`)
    this.name = 'PhpUnserializeError'
  }
}

export function phpUnserialize(input: string): PhpValue {
  const buf = Buffer.from(input, 'utf8')
  let pos = 0

  const fail = (message: string): never => {
    throw new PhpUnserializeError(message, input, pos)
  }
  const expect = (char: string) => {
    if (buf[pos] !== char.charCodeAt(0)) fail(`expected '${char}'`)
    pos++
  }
  const readUntil = (char: string): string => {
    const end = buf.indexOf(char.charCodeAt(0), pos)
    if (end < 0) fail(`missing '${char}'`)
    const text = buf.toString('utf8', pos, end)
    pos = end + 1
    return text
  }
  const readInt = (terminator: string): number => {
    const text = readUntil(terminator)
    if (!/^-?\d+$/.test(text)) fail(`invalid integer '${text}'`)
    return Number.parseInt(text, 10)
  }

  const parseValue = (): PhpValue => {
    const type = String.fromCharCode(buf[pos] ?? 0)
    pos++
    switch (type) {
      case 'N':
        expect(';')
        return null
      case 'b': {
        expect(':')
        const flag = readUntil(';')
        if (flag !== '0' && flag !== '1') fail(`invalid boolean '${flag}'`)
        return flag === '1'
      }
      case 'i':
        expect(':')
        return readInt(';')
      case 'd': {
        expect(':')
        const text = readUntil(';')
        const value = Number(text)
        if (Number.isNaN(value) && text !== 'NAN') fail(`invalid float '${text}'`)
        return value
      }
      case 's': {
        expect(':')
        const length = readInt(':')
        expect('"')
        if (pos + length > buf.length) fail(`string length ${length} runs past the end`)
        const text = buf.toString('utf8', pos, pos + length)
        pos += length
        expect('"')
        expect(';')
        return text
      }
      case 'a': {
        expect(':')
        const count = readInt(':')
        expect('{')
        const entries: [string | number, PhpValue][] = []
        for (let i = 0; i < count; i++) {
          const key = parseValue()
          if (typeof key !== 'string' && typeof key !== 'number') fail('array key must be int or string')
          entries.push([key as string | number, parseValue()])
        }
        expect('}')
        // PHP lists (keys 0..n-1) become JS arrays; everything else becomes an object.
        const isList = entries.every(([key], index) => key === index)
        return isList ? entries.map(([, value]) => value) : Object.fromEntries(entries.map(([k, v]) => [String(k), v]))
      }
      default:
        return fail(`unsupported type '${type}'`)
    }
  }

  const value = parseValue()
  if (pos !== buf.length) fail('trailing data')
  return value
}

/** True if the string looks like PHP-serialized data (cheap check before parsing). */
export const looksSerialized = (value: string): boolean => /^(a:\d+:\{|s:\d+:"|i:-?\d+;|b:[01];|d:[^;]+;|N;)/.test(value)

/** Parses if serialized; returns undefined (instead of throwing) when the value isn't valid serialized data. */
export function tryUnserialize(value: string): PhpValue | undefined {
  if (!looksSerialized(value)) return undefined
  try {
    return phpUnserialize(value)
  } catch {
    return undefined
  }
}
