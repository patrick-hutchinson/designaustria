import type { Mapped } from './mappers'

// WordPress/ACF date-time fields are site-local time (Vienna) without a time zone, e.g. "2026-12-04 12:00:00".
// Payload stores UTC.

const VIENNA = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Vienna',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Offset of Vienna from UTC at the instant `utcMs`, in ms (+1 h in winter, +2 h in summer). */
function viennaOffset(utcMs: number): number {
  const parts = Object.fromEntries(VIENNA.formatToParts(new Date(utcMs)).map((p) => [p.type, Number(p.value)]))
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - utcMs
}

/**
 * "YYYY-MM-DD HH:MM[:SS]" in Vienna local time → ISO timestamp in UTC. Empty → null; anything else → null + warning.
 * Local times that don't exist (the hour skipped when DST starts) move forward by an hour; times that occur twice
 * (when DST ends) are read as the first, summer-time one.
 */
export function viennaToUtc(value: string | null | undefined): Mapped<string> {
  const text = value?.trim()
  if (!text || text.startsWith('0000-00-00')) return { value: null }
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text)
  if (!match) return { value: null, warning: `datetime: invalid "${text}"` }
  const [year, month, day, hour, minute, second] = [1, 2, 3, 4, 5, 6].map((i) => Number(match[i] ?? 0))
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  const check = new Date(asUtc)
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) {
    return { value: null, warning: `datetime: invalid "${text}"` }
  }
  // The offsets a day before and after cover both sides of a DST switch. A candidate is valid if Vienna really has
  // that offset at that instant; the earliest valid one wins. None valid = the skipped hour: use the offset before it.
  const DAY = 86_400_000
  const offsets = [...new Set([viennaOffset(asUtc - DAY), viennaOffset(asUtc + DAY)])]
  const valid = offsets.map((offset) => asUtc - offset).filter((candidate) => viennaOffset(candidate) === asUtc - candidate)
  const result = valid.length ? Math.min(...valid) : asUtc - viennaOffset(asUtc - DAY)
  return { value: new Date(result).toISOString() }
}
