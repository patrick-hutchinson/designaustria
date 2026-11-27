// Shared startup for the shop's WordPress migration scripts (seed, import, verify): boots Vendure in-process as a worker,
// like the Payload Local API on the app side. Plan: designaustria-app/migration/wordpress/docs/06-products-plan.md §5.
//
// Safety:
// - Refuses any database that isn't on localhost unless --allow-remote is passed. .env.local points at the Neon dev
//   branch, so forgetting to set DATABASE_URL must not write there.
// - Stops if src/migrations has migrations the database hasn't run yet. The shop's databases are always migrated
//   (`synchronize: false`, `runMigrations()` on start), never pushed, so there's no exception for that.
//
// The shared pure helpers (Report, extract types, mappers) and the extract itself come from designaustria-app.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { bootstrapWorker, ConfigService, DefaultLogger, LogLevel, RequestContextService, TransactionalConnection, User, type RequestContext } from '@vendure/core'
import { DataSource } from 'typeorm'

import { config } from '../../src/vendure-config'

export const APP_MIGRATION_DIR = path.resolve(__dirname, '../../../designaustria-app/migration/wordpress')
export const DATA_DIR = path.resolve(APP_MIGRATION_DIR, '../../.data')
const EXTRACT_DIR = path.join(DATA_DIR, 'wp-extract')

export const readExtract = <T>(file: string): T[] => JSON.parse(readFileSync(path.join(EXTRACT_DIR, file), 'utf8'))

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

export interface Shop {
  /** Request context of the superadmin in the default channel, German */
  ctx: RequestContext
  get<T>(type: new (...args: never[]) => T): T
  /** Processes the jobs the writes queued (search index), then shuts Vendure down. */
  close(options?: { waitForJobs?: boolean }): Promise<void>
}

export async function startShop({ allowRemote }: Pick<ScriptArgs, 'allowRemote'>): Promise<Shop> {
  const url = process.env.DATABASE_URL ?? ''
  const host = /@([^:/?]+)/.exec(url)?.[1] ?? '(none)'
  if (!['localhost', '127.0.0.1'].includes(host) && !allowRemote) {
    throw new Error(
      `DATABASE_URL points to ${host}. Refusing to write to a non-local database.\n` +
        'Set DATABASE_URL=postgres://vendure:vendure@127.0.0.1:5434/vendure, or pass --allow-remote on purpose.',
    )
  }
  console.log(`Shop database: ${host}`)
  await checkMigrations()

  const worker = await bootstrapWorker({ ...config, logger: new DefaultLogger({ level: LogLevel.Warn }) })
  const { app } = worker
  const superadmin = await app
    .get(TransactionalConnection)
    .rawConnection.getRepository(User)
    .findOne({ where: { identifier: config.authOptions?.superadminCredentials?.identifier ?? 'superadmin' }, relations: ['roles', 'roles.channels'] })
  if (!superadmin) throw new Error('No superadmin user in the shop database')
  const ctx = await app.get(RequestContextService).create({ apiType: 'admin', user: superadmin, languageCode: 'de' as never })

  return {
    ctx,
    get: (type) => app.get(type),
    async close({ waitForJobs = false } = {}) {
      if (waitForJobs) await processJobs(worker)
      await app.close()
    },
  }
}

/** Stops when the database is behind src/migrations (before Vendure starts, which would write its defaults). */
async function checkMigrations() {
  const db = config.dbConnectionOptions
  const dataSource = new DataSource({ ...db, entities: [], synchronize: false, logging: false } as never)
  await dataSource.initialize()
  try {
    const hasTable = await dataSource.createQueryRunner().hasTable('migrations')
    const pending = hasTable ? await dataSource.showMigrations() : true
    if (pending) {
      throw new Error(
        'Shop database schema is behind src/migrations: start the shop once on it (npm run dev:server runs them),\n' +
          'or run `npx vendure migrate --run` in designaustria-shop.',
      )
    }
  } finally {
    await dataSource.destroy()
  }
}

/** Starts the job queue and waits until the jobs the import queued (search index updates) are done. */
async function processJobs(worker: Awaited<ReturnType<typeof bootstrapWorker>>) {
  await worker.startJobQueue()
  const strategy = worker.app.get(ConfigService).jobQueueOptions.jobQueueStrategy as unknown as {
    findMany?: (options: unknown) => Promise<{ totalItems: number }>
  }
  if (!strategy.findMany) return
  const started = Date.now()
  for (;;) {
    const { totalItems } = await strategy.findMany({ filter: { state: { in: ['PENDING', 'RUNNING', 'RETRYING'] } }, take: 0 })
    if (totalItems === 0) break
    if (Date.now() - started > 5 * 60_000) {
      console.warn(`⚠ ${totalItems} jobs still open after 5 minutes; the shop's worker finishes them when it runs`)
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

export const errors: string[] = []
export const check = (ok: boolean, message: string) => {
  console.log(`${ok ? '✓' : '✗'} ${message}`)
  if (!ok) errors.push(message)
}
