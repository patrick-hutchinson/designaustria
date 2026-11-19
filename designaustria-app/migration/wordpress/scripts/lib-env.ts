// Shared startup for scripts that talk to Payload (import, verify).
//
// Safety:
// - Refuses any database that isn't on localhost unless --allow-remote is passed. .env.local points at the
//   shared Neon database, so forgetting to set DATABASE_URL must not write there.
// - Sets PAYLOAD_MIGRATING so Payload never pushes the schema in dev mode; the schema comes from src/migrations only.
// - Stops if src/migrations has migrations the database hasn't run yet.

import nextEnv from '@next/env'
import type { Payload } from 'payload'

export interface ScriptArgs {
  dryRun: boolean
  only: Set<string> | null
  allowRemote: boolean
}

export function parseArgs(argv = process.argv.slice(2)): ScriptArgs {
  const only = argv.find((arg) => arg.startsWith('--only='))
  return {
    dryRun: argv.includes('--dry-run'),
    only: only ? new Set(only.slice('--only='.length).split(',').filter(Boolean)) : null,
    allowRemote: argv.includes('--allow-remote'),
  }
}

export async function startPayload({ allowRemote }: Pick<ScriptArgs, 'allowRemote'>): Promise<Payload> {
  nextEnv.loadEnvConfig(process.cwd()) // .env / .env.local; never overrides variables already set
  process.env.PAYLOAD_MIGRATING = 'true'

  const url = process.env.DATABASE_URL ?? ''
  const host = /@([^:/?]+)/.exec(url)?.[1] ?? '(none)'
  if (!['localhost', '127.0.0.1'].includes(host) && !allowRemote) {
    throw new Error(
      `DATABASE_URL points to ${host}. Refusing to write to a non-local database.\n` +
        'Set DATABASE_URL=postgres://payload:payload@127.0.0.1:5433/payload, or pass --allow-remote on purpose.',
    )
  }
  console.log(`Database: ${host}`)

  const { getPayload } = await import('payload')
  const config = (await import('@payload-config')).default
  const { migrations } = await import('@/migrations')
  const payload = await getPayload({ config })

  const ran = await payload.find({ collection: 'payload-migrations', pagination: false, limit: 0, depth: 0 })
  const ranNames = new Set(ran.docs.map((doc) => doc.name))
  const pending = migrations.map((m) => m.name).filter((name) => !ranNames.has(name))
  if (pending.length) {
    throw new Error(`Database schema is behind: run "npm run payload -- migrate" first (pending: ${pending.join(', ')})`)
  }
  return payload
}

/** Runs `task` over `items` with at most `limit` running at once. */
export async function mapPool<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
