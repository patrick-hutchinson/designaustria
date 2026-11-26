// Import: .data/wp-extract/*.json → Payload (Local API).
// A full run first wipes everything a previous import wrote (wipe.ts; team accounts made on the new site are kept),
// so the database always matches the extract exactly. With --only=… nothing is wiped and records are upserted by
// legacy key instead.
//
// Usage (from designaustria-app/):
//   DATABASE_URL=postgres://payload:payload@127.0.0.1:5433/payload \
//     npx tsx migration/wordpress/scripts/import/run.ts [--dry-run] [--only=users,members] [--allow-remote]
//
// The steps and their order are in steps/index.ts.

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { Report } from '../../lib/report'
import { parseArgs, startPayload } from '../lib-env'
import { DATA_DIR, resolver, type StepResult } from './step'
import { STEPS } from './steps'
import { wipeImportedData } from './wipe'

async function main() {
  const args = parseArgs()
  const unknown = [...(args.only ?? [])].filter((name) => !STEPS.some((step) => step.name === name))
  if (unknown.length) throw new Error(`Unknown step(s) in --only: ${unknown.join(', ')}. Steps: ${STEPS.map((s) => s.name).join(', ')}`)

  const payload = await startPayload(args)
  const report = new Report()
  const ctx = { payload, report, dryRun: args.dryRun, resolve: resolver(report, args.dryRun) }
  const results: Record<string, StepResult> = {}
  console.log(args.dryRun ? 'DRY RUN: nothing is written\n' : '')

  if (args.only) console.log(`--only=${[...args.only].join(',')}: no wipe, upserting\n`)
  else await wipeImportedData(payload, STEPS, { dryRun: args.dryRun })

  for (const step of STEPS) {
    if (args.only && !args.only.has(step.name)) continue
    results[step.name] = await step.run(ctx)
  }

  const out = path.join(DATA_DIR, 'wp-import')
  mkdirSync(out, { recursive: true })
  writeFileSync(path.join(out, '_report.json'), `${JSON.stringify({ dryRun: args.dryRun, results, warnings: report.toJSON() }, null, 2)}\n`)
  const counts = report.counts()
  if (Object.keys(counts).length) {
    console.log('\nWarnings by type (details in .data/wp-import/_report.json):')
    console.table(counts)
  }
  const failed = Object.values(results).some((r) => r.counts.failed)
  if (failed) process.exitCode = 1
  process.exit()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
