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
    ├── import/              JSON → Payload via Local API, upsert by legacy WP id
    └── verify/              compares Payload with the extract, fails on any mismatch
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
npm run wp:import -- --dry-run        # what would be created/updated
npm run wp:import                     # write; --only=users,members to limit
npm run wp:verify                     # fails on any mismatch with the extract
```

- The import **refuses non-local databases** unless `--allow-remote` is passed (`.env.local` points at Neon).
- It stops if the database hasn't run all of `src/migrations`, and never pushes the schema itself.
- Reports with details (may contain personal values) go to `.data/wp-extract/_report.json` and `.data/wp-import/_report.json`.
- On the anonymised dump: 118 categories, 1,832 users, 151 organisations, 2,928 members (12 duplicates merged),
  297 organisation links (130 admins). The first import takes about a minute, mostly password hashing.

## Rerunning safely

- **Load** recreates the database from scratch on every run.
- **Analyze** only reads `wordpress`; derived tables go in `wp_analysis`, which is dropped and rebuilt on every run.
- **Extract** overwrites its JSON output deterministically: the same dump gives byte-identical files.
- **Import**: every migrated Payload document stores its WordPress ID in a unique `legacyWpId` field (`legacyKey` for
  organisation links) and is upserted by it. Relationships are resolved through those keys, so rerunning updates records
  instead of duplicating them (tested: a second run updates all records, row counts unchanged).
- **Verify** only reads.
- **Passwords**: a user who already has a password on the new site (first login with the WordPress password, a change
  or a reset; `legacyPasswordRetiredAt` is set) keeps it. The import doesn't write their WordPress hash again (plan §6).
