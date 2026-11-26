# WordPress → Payload migration

One-off data migration from the old designaustria WordPress/WooCommerce site into Payload.
This is **separate from `src/migrations/`**: those are Payload schema migrations that run on every Vercel build.
Nothing in this folder runs automatically.

## Layout

```
migration/wordpress/
├── docs/
│   ├── 01-analysis.md       how the WP database is structured
│   └── 02-plan.md           WP → Payload mapping and decisions
├── config/merges.json       reviewed decisions for duplicate member profiles (plan §4)
├── docker-compose.yml       throwaway MySQL 8.4 to read the dump + local Payload Postgres
├── lib/                     parsers and mappers (PHP unserialize, ACF ids/repeaters, status split, merges, upsert) + unit tests
└── scripts/
    ├── 00-load-dump.sh      load the SQL dump into MySQL
    ├── analyze/             read-only SQL behind the numbers in 01-analysis.md, plus check-helpers.ts
    ├── extract/             MySQL → cleaned, deduplicated JSON in .data/wp-extract/
    ├── import/              JSON → Payload via Local API: wipe previous import, then create (keeps the team's own accounts).
    │                        One step per entity in steps/, in dependency order in steps/index.ts
    └── verify/              compares Payload with the extract, fails on any mismatch. One step per entity in steps/
```

Data stays in `.data/` (gitignored): the raw dump, analysis output and extracted JSON.

## Running

Requires Docker. Run from `designaustria-app/`.

```sh
# 1. Load the dump (newest .data/*wordpress-database_export.sql, or pass a path).
#    Drops and recreates the `wordpress` DB, so it's safe to rerun.
migration/wordpress/scripts/00-load-dump.sh

# 2. Analysis queries → .data/wp-analysis/*.txt
#    Rebuilds the scratch schema `wp_analysis`; never writes to `wordpress`.
migration/wordpress/scripts/analyze/run.sh            # all
migration/wordpress/scripts/analyze/run.sh shop       # only files matching "shop"

# Ad-hoc queries
docker exec -it designaustria-wp-mysql mysql -uroot -pwp wordpress

# Tear down (removes the container and its data volume)
docker compose -f migration/wordpress/docker-compose.yml down -v
```

MySQL listens on `127.0.0.1:3307` (user `root`, password `wp`) so it doesn't clash with a local MySQL.

The same compose file has a local Payload Postgres (`payload-db`, `127.0.0.1:5433`) to develop the schema and the import
against, so nothing touches the shared Neon database:

```sh
docker compose -f migration/wordpress/docker-compose.yml up -d --wait payload-db
export DATABASE_URL=postgres://payload:payload@127.0.0.1:5433/payload
npm run payload -- migrate                       # apply src/migrations
PAYLOAD_SECRET=local-test-secret npm run test:int  # incl. access-control tests (local DB only)
```

Helpers:

```sh
npm run test:migration                                       # unit tests for lib/ (no database)
npx tsx migration/wordpress/scripts/analyze/check-helpers.ts # run the parsers over the whole loaded dump
```

Run `check-helpers.ts` on every new dump: it fails on serialized data or relation fields the parsers can't read,
and lists values the mappers don't know (e.g. a new country spelling), so they can be added before extracting.

### Migrating people and organisations

```sh
# with the dump loaded (step 1) and payload-db running + migrated (see above)
export DATABASE_URL=postgres://payload:payload@127.0.0.1:5433/payload

npm run wp:extract                    # dump → .data/wp-extract/*.json + _report.json (warnings)
npm run wp:import -- --dry-run        # what would be wiped and written
npm run wp:import                     # wipe previous import, then write; --only=users,members upserts without wiping
npm run wp:verify                     # fails on any mismatch with the extract; --only=members checks one entity
```

- The import **refuses non-local databases** unless `--allow-remote` is passed (`.env.local` points at Neon).
- It stops if the database hasn't run all of `src/migrations`, and never pushes the schema itself.
- Reports with details (may contain personal values) go to `.data/wp-extract/_report.json` and `.data/wp-import/_report.json`.
- On the anonymised dump (published profiles only, plan §3.1): 116 categories, 1,215 users, 102 organisations,
  1,293 members (10 duplicates merged), 181 organisation links (108 admins). The first import takes about a minute, mostly password hashing.

### Adding an entity

Extract runs everything in one go, so the output files always agree with each other (e.g. categories only keep terms used by
something migrated). Import and verify are split by entity:

1. `scripts/extract/<entity>.ts`, called from `extract/run.ts`; add its file to `EXTRACT_FILES` and its type to `lib/extract-types.ts`.
2. `scripts/import/steps/<entity>.ts`: an `ImportStep` (`name`, what the full run wipes, `run`). Add it to `steps/index.ts`
   after the steps it references.
3. `scripts/verify/steps/<entity>.ts` with the same `name`, added to `verify/steps/index.ts`.

Mapping that other content types will need too (dates, HTML → Lexical, slugs, redirects) goes in `lib/`, not in the entity's mappers.

## Rerunning safely

- **Load** recreates the database from scratch on every run.
- **Analyze** only reads `wordpress`; derived tables go in `wp_analysis`, which is dropped and rebuilt on every run.
- **Extract** overwrites its JSON output deterministically: the same dump gives byte-identical files.
- **Import**: a full run first wipes everything a previous import wrote, in one transaction, then imports the extract,
  so the database always matches it exactly (plan §7). Accounts made on the new site for the team (no `legacyWpId`,
  role `admin` or `staff`) are kept. With `--only=…` nothing is wiped: records are upserted by `legacyWpId`
  (`legacyKey` for organisation links). **Never run it on production after go-live.**
- **Verify** only reads.
- **Passwords**: a full import wipes the imported users, so a password set on the new site before go-live (e.g. by testers
  on preview) is lost and the WordPress hash applies again. With `--only=users`, a user who already has a password on the
  new site (`legacyPasswordRetiredAt` is set) keeps it (plan §6).
