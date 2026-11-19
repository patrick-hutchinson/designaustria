// Collects warnings during extract/import. Written to .data/ (gitignored), because details can contain personal values.

export interface ReportEntry {
  code: string
  ref: string
  message: string
}

export class Report {
  readonly entries: ReportEntry[] = []

  /** @param code short category, e.g. "member.dangling-user"; @param ref e.g. "member 1234" */
  warn(code: string, ref: string, message: string): void {
    this.entries.push({ code, ref, message })
  }

  /** Adds a mapper warning if there is one. */
  mapped<T>(ref: string, result: { value: T | null; warning?: string }): T | null {
    if (result.warning) this.warn(`value.${result.warning.split(':')[0]}`, ref, result.warning)
    return result.value
  }

  counts(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const { code } of this.entries) counts[code] = (counts[code] ?? 0) + 1
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
  }

  toJSON() {
    const sorted = [...this.entries].sort((a, b) => a.code.localeCompare(b.code) || a.ref.localeCompare(b.ref, 'en', { numeric: true }))
    return { counts: this.counts(), entries: sorted }
  }
}
