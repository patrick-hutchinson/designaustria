// Interactive menu for importing the WordPress extract into a database: asks for the database, the entities
// and what to do, then runs import/run.ts and verify/run.ts. Those keep all their own safety checks.
//
// Usage (from designaustria-app/): npm run wp:sync
//
// Expects the extract in .data/wp-extract (npm run wp:extract).

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as p from '@clack/prompts'
import dotenv from 'dotenv'

import { EXTRACT_FILES } from '../lib/extract-types'
import { DATA_DIR } from './import/step'
import { STEPS } from './import/steps'

const LOCAL_DOCKER_URL = 'postgres://payload:payload@127.0.0.1:5433/payload'
const SCRIPTS = path.dirname(fileURLToPath(import.meta.url))

// What each import step looks up from earlier steps (the idMap calls in import/steps/*.ts), so a group always
// brings these along. Update when a step starts referencing another entity.
const NEEDS: Record<string, string[]> = {
  members: ['users', 'categories'],
  organizations: ['categories'],
  'organization-members': ['organizations', 'members'],
  events: ['categories'],
  posts: ['categories'],
}

// The groups to pick from, by the step they're for; the menu adds everything those steps need.
const GROUPS: Record<'members' | 'events' | 'posts', { label: string; hint?: string; steps: string[] }> = {
  members: { label: 'Members', hint: 'people and organisations', steps: ['organization-members'] },
  events: { label: 'Events', steps: ['events'] },
  posts: { label: 'News', hint: 'posts', steps: ['posts'] },
}

// The steps plus everything they need, in import order.
function withDependencies(steps: string[]) {
  const all = new Set<string>()
  const add = (name: string) => {
    if (all.has(name)) return
    all.add(name)
    NEEDS[name]?.forEach(add)
  }
  steps.forEach(add)
  return STEPS.map(({ name }) => name).filter((name) => all.has(name))
}

// Exits on Ctrl-C / Esc in any prompt.
function answer<T>(value: T | symbol): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel('Cancelled, nothing was written.')
    process.exit(0)
  }
  return value as Exclude<T, symbol>
}

// Host and database name only, so the password never ends up on screen.
function describe(url: string) {
  try {
    const { hostname, port, pathname } = new URL(url)
    return `${hostname}${port ? `:${port}` : ''}${pathname}`
  } catch {
    return null
  }
}

const isLocal = (url: string) => ['localhost', '127.0.0.1'].includes(new URL(url).hostname)

// .env.local itself, not process.env: a DATABASE_URL exported in the shell must not quietly win.
function envLocalUrl() {
  const file = path.resolve(process.cwd(), '.env.local')
  return existsSync(file) ? dotenv.parse(readFileSync(file)).DATABASE_URL : undefined
}

function run(script: string, args: string[], databaseUrl: string) {
  const { status } = spawnSync('npx', ['tsx', path.join(SCRIPTS, script), ...args], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })
  return status === 0
}

async function pickDatabase() {
  const fromEnv = envLocalUrl()
  const target = answer(
    await p.select({
      message: 'Database',
      options: [
        ...(fromEnv ? [{ value: 'env', label: '.env.local', hint: describe(fromEnv) ?? undefined }] : []),
        { value: 'paste', label: 'Paste a URL', hint: 'e.g. preview' },
        { value: 'docker', label: 'Local Docker', hint: describe(LOCAL_DOCKER_URL)! },
      ],
    }),
  )
  if (target === 'env') return fromEnv!
  if (target === 'docker') return LOCAL_DOCKER_URL
  const pasted = answer(
    await p.password({
      message: 'Database URL (hidden)',
      validate: (value) => (describe(value?.trim() ?? '') ? undefined : 'Not a valid URL'),
    }),
  ).trim()
  p.log.info(`Database: ${describe(pasted)}`)
  return pasted
}

// null = everything (full import with wipe), otherwise the step names, dependencies included.
async function pickEntities(action: 'import' | 'verify'): Promise<string[] | null> {
  for (;;) {
    const group = answer(
      await p.select({
        message: 'What',
        options: [
          { value: 'all' as const, label: 'All', hint: action === 'import' ? 'wipes the previous import first' : undefined },
          ...Object.entries(GROUPS).map(([value, { label, hint }]) => ({ value: value as keyof typeof GROUPS, label, hint })),
        ],
      }),
    )
    const only = group === 'all' ? null : withDependencies(GROUPS[group].steps)
    const tables = (only ?? STEPS.map(({ name }) => name)).join(', ')
    const message =
      action === 'verify'
        ? `This will verify ${tables}. OK?`
        : only
          ? `This will import ${tables} (no wipe). OK?`
          : `This will wipe the previous import, then import ${tables}. OK?`
    if (answer(await p.confirm({ message }))) return only
  }
}

async function main() {
  p.intro('WordPress import')

  const extract = path.join(DATA_DIR, 'wp-extract', EXTRACT_FILES.events)
  if (!existsSync(extract)) {
    p.cancel('No extract in .data/wp-extract: run `npm run wp:extract` first.')
    process.exit(1)
  }
  p.log.info(`Extract from ${statSync(extract).mtime.toLocaleString()}`)

  const databaseUrl = await pickDatabase()
  const action = answer(
    await p.select({
      message: 'Action',
      options: [
        { value: 'import' as const, label: 'Import', hint: 'dry run, confirm, import, verify' },
        { value: 'verify' as const, label: 'Verify only', hint: 'read-only' },
      ],
    }),
  )
  const only = await pickEntities(action)

  const args = [...(only ? [`--only=${only.join(',')}`] : []), ...(isLocal(databaseUrl) ? [] : ['--allow-remote'])]
  const summary = `${only ? only.join(', ') : 'everything'} → ${describe(databaseUrl)}`

  if (action === 'import') {
    p.log.step(`Dry run: ${summary}`)
    if (!run('import/run.ts', [...args, '--dry-run'], databaseUrl)) {
      p.cancel('Dry run failed, nothing was written.')
      process.exit(1)
    }

    if (!only) p.log.warn('This wipes the previous import first, including passwords set on the new site.')
    if (isLocal(databaseUrl)) {
      if (!answer(await p.confirm({ message: `Write ${summary}?`, initialValue: false }))) {
        p.cancel('Cancelled, nothing was written.')
        process.exit(0)
      }
    } else {
      // A remote database needs its host name typed out, not just a yes.
      const host = new URL(databaseUrl).hostname
      answer(
        await p.text({
          message: `Write ${summary}? Type the host name to confirm`,
          placeholder: host,
          validate: (value) => (value?.trim() === host ? undefined : `Type ${host}, or Esc to cancel`),
        }),
      )
    }

    p.log.step(`Import: ${summary}`)
    if (!run('import/run.ts', args, databaseUrl)) {
      p.cancel('Import failed, see above. Skipping verify.')
      process.exit(1)
    }
  }

  p.log.step(`Verify: ${summary}`)
  const ok = run('verify/run.ts', args, databaseUrl)
  if (ok) p.outro('Done')
  else p.cancel('Verify failed, see above.')
  process.exit(ok ? 0 : 1)
}

main().catch((error) => {
  p.cancel(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
