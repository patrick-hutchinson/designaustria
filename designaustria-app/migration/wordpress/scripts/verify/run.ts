// Verify: compares Payload with the extract (.data/wp-extract) and fails on any mismatch (plan §9). Read-only.
//
// Usage (from designaustria-app/):
//   DATABASE_URL=postgres://payload:payload@127.0.0.1:5433/payload \
//     npx tsx migration/wordpress/scripts/verify/run.ts [--only=members,events]
//
// The checks per entity are in steps/*.ts.

import { parseArgs, startPayload } from '../lib-env'
import { createContext, errors } from './check'
import { STEPS } from './steps'

async function main() {
  const args = parseArgs()
  const unknown = [...(args.only ?? [])].filter((name) => !STEPS.some((step) => step.name === name))
  if (unknown.length) throw new Error(`Unknown step(s) in --only: ${unknown.join(', ')}. Steps: ${STEPS.map((s) => s.name).join(', ')}`)

  const ctx = createContext(await startPayload(args))
  for (const step of STEPS) {
    if (args.only && !args.only.has(step.name)) continue
    console.log(`\n${step.name}`)
    await step.run(ctx)
  }

  console.log(errors.length ? `\n${errors.length} check(s) failed` : '\nAll checks passed')
  process.exit(errors.length ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
