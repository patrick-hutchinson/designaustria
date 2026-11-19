// ACF stores a repeater as a row count plus numbered keys:
//   da_address = "2"
//   da_address_0_da_address_city = "Wien"
//   da_address_1_da_address_city = "Graz"
// readRepeater turns that back into rows. Only rows below the count are read (ACF can leave stale keys).

export type Meta = Record<string, string>

/** Rows of a repeater; each row maps the sub-field name (e.g. "da_address_city") to its raw value. */
export function readRepeater(meta: Meta, name: string): Meta[] {
  const count = Number.parseInt(meta[name] ?? '', 10)
  if (!Number.isInteger(count) || count <= 0) return []

  const rows: Meta[] = Array.from({ length: count }, () => ({}))
  const prefix = `${name}_`
  for (const [key, value] of Object.entries(meta)) {
    if (!key.startsWith(prefix)) continue
    const match = /^(\d+)_(.+)$/.exec(key.slice(prefix.length))
    if (!match) continue
    const index = Number(match[1])
    if (index < count) rows[index][match[2]] = value
  }
  return rows
}

/** True if every value in the row is empty (ACF keeps empty rows when an editor adds and never fills one). */
export const isEmptyRow = (row: Meta): boolean => Object.values(row).every((value) => !value?.trim())
