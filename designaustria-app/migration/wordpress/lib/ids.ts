import { looksSerialized, phpUnserialize, type PhpValue } from './php-unserialize'

// ACF stores relationships, post objects, galleries and checkboxes either as a PHP-serialized
// array (a:1:{i:0;s:4:"2890";}) or, in older rows, as a bare value ("2890").
// These helpers accept both. Unparseable serialized data throws: better to stop than to drop links silently.

const listValues = (value: string): PhpValue[] => {
  if (!looksSerialized(value)) return [value]
  const parsed = phpUnserialize(value)
  if (Array.isArray(parsed)) return parsed
  if (parsed !== null && typeof parsed === 'object') return Object.values(parsed)
  return [parsed]
}

/** Positive integer IDs, deduplicated, order kept. Empty, "0" and non-numeric entries are dropped. */
export function parseIdList(value: string | null | undefined): number[] {
  const trimmed = value?.trim()
  if (!trimmed) return []
  const ids = listValues(trimmed)
    .map((item) => (typeof item === 'number' ? item : typeof item === 'string' && /^\d+$/.test(item.trim()) ? Number(item) : NaN))
    .filter((id) => Number.isInteger(id) && id > 0)
  return [...new Set(ids)]
}

/** First ID of a single-value relation field, or null. */
export const parseId = (value: string | null | undefined): number | null => parseIdList(value)[0] ?? null

/** Non-empty strings (checkbox/select values), deduplicated, order kept. */
export function parseStringList(value: string | null | undefined): string[] {
  const trimmed = value?.trim()
  if (!trimmed) return []
  const items = listValues(trimmed)
    .map((item) => (typeof item === 'string' || typeof item === 'number' ? String(item).trim() : ''))
    .filter(Boolean)
  return [...new Set(items)]
}
