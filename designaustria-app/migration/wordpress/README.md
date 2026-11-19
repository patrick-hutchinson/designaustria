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
├── docker-compose.yml       throwaway MySQL 8.4 used only to read the dump
├── lib/                     shared helpers (todo)
└── scripts/
    ├── 00-load-dump.sh      load the SQL dump into MySQL
    ├── analyze/             read-only SQL behind the numbers in 01-analysis.md
    ├── extract/             MySQL → normalised JSON in .data/wp-extract/ (todo)
    └── import/              JSON → Payload via Local API, upsert by legacy WP id (todo)
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

## Rerunning safely

- **Load** recreates the database from scratch on every run.
- **Analyze** only reads `wordpress`; derived tables go in `wp_analysis`, which is dropped and rebuilt on every run.
- **Extract** (todo) will overwrite its JSON output deterministically.
- **Import** (todo): every migrated Payload document stores its WordPress ID in a unique `legacyWpId` field and is upserted by it.
  Relationships are resolved through `legacyWpId`, so rerunning updates records instead of duplicating them.
