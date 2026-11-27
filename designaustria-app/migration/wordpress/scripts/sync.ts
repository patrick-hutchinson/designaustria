// Interactive menu for importing the WordPress extract: asks for the system (website = Payload, shop = Vendure, or
// both), then per system the database and what, then runs the scripts: import/run.ts and verify/run.ts for the website,
// designaustria-shop/migration/wordpress (seed, import, verify) for the shop. Those keep all their own safety checks.
// The two don't depend on each other (both derive the SKU from the extract, 06-products-plan §3.3), so either runs alone.
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
const LOCAL_SHOP_URL = 'postgres://vendure:vendure@127.0.0.1:5434/vendure'
const SCRIPTS = path.dirname(fileURLToPath(import.meta.url))
const SHOP_DIR = path.resolve(SCRIPTS, '../../../../designaustria-shop')

// What each import step looks up from earlier steps (the idMap calls in import/steps/*.ts), so a group always
// brings these along. Update when a step starts referencing another entity.
const NEEDS: Record<string, string[]> = {
  members: ['users', 'categories'],
  organizations: ['categories'],
  'organization-members': ['organizations', 'members'],
  events: ['categories'],
  posts: ['categories'],
  products: ['categories', 'members'],
}

// The groups to pick from, by the step they're for; the menu adds everything those steps need.
const GROUPS: Record<'members' | 'events' | 'posts' | 'products', { label: string; hint?: string; steps: string[] }> = {
  members: { label: 'Members', hint: 'people and organisations', steps: ['organization-members'] },
  events: { label: 'Events', steps: ['events'] },
  posts: { label: 'News', hint: 'posts', steps: ['posts'] },
  products: { label: 'Products', hint: 'publications; their shop products are the Shop system', steps: ['products'] },
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
function envLocalUrl(dir = process.cwd()) {
  const file = path.resolve(dir, '.env.local')
  return existsSync(file) ? dotenv.parse(readFileSync(file)).DATABASE_URL : undefined
}

function run(script: string, args: string[], databaseUrl: string) {
  const { status } = spawnSync('npx', ['tsx', path.join(SCRIPTS, script), ...args], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })
  return status === 0
}

// The shop's scripts run in designaustria-shop, where @vendure/core and its .env.local are.
function runShop(script: string, args: string[], databaseUrl: string) {
  const { status } = spawnSync('npx', ['tsx', path.join('migration/wordpress', script), ...args], {
    stdio: 'inherit',
    cwd: SHOP_DIR,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })
  return status === 0
}

async function pickDatabase(
  { label, envDir, localUrl }: { label: string; envDir?: string; localUrl: string },
): Promise<string> {
  const fromEnv = envLocalUrl(envDir)
  const envLabel = envDir ? `${path.basename(envDir)}/.env.local` : '.env.local'
  const target = answer(
    await p.select({
      message: label,
      options: [
        ...(fromEnv ? [{ value: 'env', label: envLabel, hint: describe(fromEnv) ?? undefined }] : []),
        { value: 'paste', label: 'Paste a URL', hint: 'e.g. preview' },
        { value: 'docker', label: 'Local Docker', hint: describe(localUrl)! },
      ],
    }),
  )
  if (target === 'env') return fromEnv!
  if (target === 'docker') return localUrl
  const pasted = answer(
    await p.password({
      message: 'Database URL (hidden)',
      validate: (value) => (describe(value?.trim() ?? '') ? undefined : 'Not a valid URL'),
    }),
  ).trim()
  p.log.info(`Database: ${describe(pasted)}`)
  return pasted
}

// What on the website. null = everything (full import with wipe), otherwise the step names, dependencies included.
async function pickEntities(action: Action): Promise<string[] | null> {
  for (;;) {
    const group = answer(
      await p.select({
        message: 'Website: what',
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

// What in the shop. Only shop products for now; customers, orders and downloads join with 07-shop-plan.
// false = full run (also removes imported shop products that aren't in the extract any more), true = --only, upsert only.
async function pickShopScope(action: Action): Promise<boolean> {
  if (action === 'verify') return false
  return answer(
    await p.select({
      message: 'Shop: what',
      options: [
        { value: false, label: 'All', hint: 'shop setup and shop products; removes imported ones no longer in the extract' },
        { value: true, label: 'Shop products', hint: 'shop setup, upserts shop products, removes nothing' },
      ],
    }),
  )
}

// Asks before writing: yes/no for a local database, the host name typed out for a remote one.
async function confirmWrite(summary: string, databaseUrl: string, cancelled = 'Cancelled, nothing was written.') {
  if (isLocal(databaseUrl)) {
    if (!answer(await p.confirm({ message: `Write ${summary}?`, initialValue: false }))) {
      p.cancel(cancelled)
      process.exit(0)
    }
    return
  }
  const host = new URL(databaseUrl).hostname
  answer(
    await p.text({
      message: `Write ${summary}? Type the host name to confirm`,
      placeholder: host,
      validate: (value) => (value?.trim() === host ? undefined : `Type ${host}, or Esc to cancel`),
    }),
  )
}

type Action = 'import' | 'verify'
interface WebsitePlan {
  databaseUrl: string
  only: string[] | null
}
interface ShopPlan {
  databaseUrl: string
  upsertOnly: boolean
}

// Website (Payload): dry run, confirm, import, verify.
async function syncWebsite(action: Action, { databaseUrl, only }: WebsitePlan): Promise<boolean> {
  const args = [...(only ? [`--only=${only.join(',')}`] : []), ...(isLocal(databaseUrl) ? [] : ['--allow-remote'])]
  const summary = `${only ? only.join(', ') : 'everything'} → ${describe(databaseUrl)}`
  if (action === 'import') {
    p.log.step(`Website dry run: ${summary}`)
    if (!run('import/run.ts', [...args, '--dry-run'], databaseUrl)) {
      p.cancel('Dry run failed, nothing was written.')
      return false
    }
    if (!only) p.log.warn('This wipes the previous import first, including passwords set on the new site.')
    await confirmWrite(summary, databaseUrl)
    p.log.step(`Website import: ${summary}`)
    if (!run('import/run.ts', args, databaseUrl)) {
      p.cancel('Import failed, see above. Skipping verify.')
      return false
    }
  }
  p.log.step(`Website verify: ${summary}`)
  if (!run('verify/run.ts', args, databaseUrl)) {
    p.cancel('Verify failed, see above.')
    return false
  }
  return true
}

// Shop (Vendure, 06-products-plan §5.3): seed and import as dry runs, confirm, seed, import, verify.
async function syncShop(action: Action, { databaseUrl, upsertOnly }: ShopPlan, afterWebsite: boolean): Promise<boolean> {
  const remote = isLocal(databaseUrl) ? [] : ['--allow-remote']
  const importArgs = [...(upsertOnly ? ['--only=shop-products'] : []), ...remote]
  const summary = `shop products${upsertOnly ? ' (no removals)' : ''} → ${describe(databaseUrl)}`
  if (action === 'import') {
    p.log.step(`Shop dry run: shop setup and ${summary}`)
    if (!runShop('seed.ts', [...remote, '--dry-run'], databaseUrl) || !runShop('import.ts', [...importArgs, '--dry-run'], databaseUrl)) {
      p.cancel('Shop dry run failed, nothing was written there.')
      return false
    }
    await confirmWrite(
      `the shop setup and ${summary}`,
      databaseUrl,
      afterWebsite ? 'Shop cancelled, nothing written there (the website part above is done).' : undefined,
    )
    p.log.step(`Shop import: ${summary}`)
    if (!runShop('seed.ts', remote, databaseUrl) || !runShop('import.ts', importArgs, databaseUrl)) {
      p.cancel('Shop import failed, see above. Skipping verify.')
      return false
    }
  }
  p.log.step(`Shop verify: ${summary}`)
  if (!runShop('verify.ts', remote, databaseUrl)) {
    p.cancel('Shop verify failed, see above.')
    return false
  }
  return true
}

async function main() {
  p.intro('WordPress import')

  const extract = path.join(DATA_DIR, 'wp-extract', EXTRACT_FILES.events)
  if (!existsSync(extract)) {
    p.cancel('No extract in .data/wp-extract: run `npm run wp:extract` first.')
    process.exit(1)
  }
  p.log.info(`Extract from ${statSync(extract).mtime.toLocaleString()}`)

  // Everything is asked first, so the runs don't stop halfway for a question (except the confirmations).
  const system = answer(
    await p.select({
      message: 'System',
      options: [
        { value: 'website' as const, label: 'Website', hint: 'Payload: members, events, news, products' },
        { value: 'shop' as const, label: 'Shop', hint: 'Vendure: shop setup and shop products' },
        { value: 'both' as const, label: 'Both', hint: 'website first, then the shop' },
      ],
    }),
  )
  const action = answer(
    await p.select({
      message: 'Action',
      options: [
        { value: 'import' as const, label: 'Import', hint: 'dry run, confirm, import, verify' },
        { value: 'verify' as const, label: 'Verify only', hint: 'read-only' },
      ],
    }),
  )

  let website: WebsitePlan | null = null
  if (system !== 'shop') {
    const databaseUrl = await pickDatabase({ label: 'Website database', localUrl: LOCAL_DOCKER_URL })
    website = { databaseUrl, only: await pickEntities(action) }
  }
  let shop: ShopPlan | null = null
  if (system !== 'website') {
    const databaseUrl = await pickDatabase({ label: 'Shop database', envDir: SHOP_DIR, localUrl: LOCAL_SHOP_URL })
    shop = { databaseUrl, upsertOnly: await pickShopScope(action) }
  }

  if (website && !(await syncWebsite(action, website))) process.exit(1)
  if (shop && !(await syncShop(action, shop, website !== null))) process.exit(1)

  // Products are two records (06-products-plan §1); a reminder when only one side was imported.
  if (action === 'import' && website && !shop && (!website.only || website.only.includes('products'))) {
    p.log.info('Products imported on the website only: run the Shop system for their shop products if they changed.')
  }
  p.outro('Done')
  process.exit(0)
}

main().catch((error) => {
  p.cancel(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
