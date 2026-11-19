# Migration plan: WordPress → Payload (people and organisations)

Status: **draft**. Builds on [01-analysis.md](01-analysis.md); section references (§) point there.

Legend: **Proposed** = default we'll build unless someone objects. **Decide** = needs input before building that part.

---

## 1. Scope

**In scope**
- Login accounts (`wp_users`)
- Member profiles (CPT `member`)
- Organisations (CPT `community`) and who belongs to / administers them

**Deferred (later step, see §11):** the media files these records reference (avatars, logos, portfolio images,
certificates, documents). The migration keeps the WordPress attachment IDs so the files can be attached afterwards.

**Out of scope for this plan** (separate plans later): news posts, events, publications, pages, the **shop** (products, orders,
coupons, downloads, invoices), comments, SEO data.

**Target:** the existing Payload 3.94 app (Postgres, locales `de`/`en`). Today it has `users` (bare auth), `media` and `events`.

---

## 2. Target data model

### 2.1 Overview

```mermaid
erDiagram
  users |o--o| members : "member (1:1, optional)"
  members ||--o{ organization-members : ""
  organizations ||--o{ organization-members : ""
```

| Collection | Purpose | From WP | Expected rows |
|---|---|---|---|
| `users` (auth) | Login only: email, password, roles | `wp_users` | ~1,830 |
| `members` | A person's membership record and public profile | CPT `member` | ~2,930 after dedupe (all profiles, incl. newsletter-only) |
| `organizations` | Company, studio or school | CPT `community` | ~150 |
| `organization-members` | Link person ↔ organisation, with role `member`/`admin` | ACF `da_member_community(_admin)` | 299 (297 after merges) |

### 2.2 Why keep `users` and `members` separate (Proposed)

WordPress already separates the login from the profile, and the data shows why the split is real rather than an artefact:
- **1,146 profiles have no login**: colleagues inside organisations, former members, contacts.
- **54 logins have no profile**: staff admins and a few buyers.
- Staff manage a member's record (status, fee, IBAN) independently of whether that person ever logs in.

Merging both into one auth collection would force a login (an email plus a dummy password) onto every profile, and would mix
admin-only membership data with the account. So:
- `users` stays an auth collection: `email`, `roles`, `member` (join field, read-only view of the linked profile), `legacyWpId`, and
  `legacyPasswordHash` (hidden, see §6).
- `members` has an optional, **unique** `user` relationship. That's the only place the link is stored, so the two sides can't disagree.
- One user ↔ at most one member. The 3 users linked to 2 profiles are resolved by the dedupe step (§4).

### 2.3 Roles and admin-panel access (Proposed)

A single `users` collection with `roles: ('admin' | 'staff' | 'member')[]`.
- `access.admin`: only `admin` and `staff` can open `/admin`.
- Members use the frontend (profile editing and the organisation page come later and aren't part of the migration).
- The 11 WP administrators get `admin`. Everyone else gets `member`.

### 2.4 `members` fields

| Payload field | Type | From WP (`da_member_*` unless noted) | Notes |
|---|---|---|---|
| `legacyWpId` | number, unique, indexed, read-only | `wp_posts.ID` | upsert key |
| `memberNumber` | text, indexed (**not unique**) | `id` | `000000*` → empty (placeholder); keep the `-N` suffix |
| `user` | relationship → users | `user` | dangling ids and `0` → empty |
| `profileStatus` | select `publish` / `pending` / `draft` / `private` | `post_status` | copied 1:1, see §3.1 |
| `slug` | text | `post_name` | for redirects from old profile URLs |
| `salutation` | select `d/f/m/i` | `gender` | |
| `title`, `firstName`, `lastName` | text | `title`, `firstname`, `lastname` | |
| `contactEmail`, `contactEmailPublic` | email, checkbox | `email`, `email_public` | separate from the login email |
| `birthdate` | date | `birthdate` | **staff-only** |
| `deathYear` | number | `deathyear` | |
| `tier`, `honorary`, `functions`, `boardTerms`, `bildrecht`, `newsletter` | see §3.2 | `status`, `board` | |
| `companyName` | text | `identity` | "Berufsidentität/Firmenname" |
| `jobTitle`, `employmentType` | text, select | `job`, `job_type` | |
| `about`, `motto`, `education`, `additionalQualification`, `otherFocus` | textarea | `about`, `motto`, `education`, `addition`, `owncat` | plain text in WP too |
| `keywords` | text | `keywords` | |
| `categories` | relationship → categories (hasMany) | `da_category` | see §3.4 |
| `legacy.avatarWpId` | number | `avatar` | WP attachment id; an upload field follows in §11 |
| `addresses[]` | array: type, street, number, zip, city, country, visibility | `da_address` repeater | |
| `phones[]` | array: type, number, visibility | `da_number` repeater | |
| `links[]` | array: type, url | `da_online` repeater | |
| `portfolio[]` | array: name, visibility, `imageWpIds` (json, hidden) | `da_portfolio` repeater | images follow in §11 |
| `documents[]` | array: type, name, `fileWpId` (hidden) | `da_documents` repeater | file follows in §11 |
| `legacy.studentProofWpId` | number, staff-only | `cert` | file follows in §11 |
| `billing` (group, **staff-only**) | paymentType, paymentFrequency, iban, feeOverride, feeNote | `payment_type`, `payment_frequency`, `iban`, `fee`, `fee_description` | frequency `year`→`yearly`, `trimester`→`quarterly` |
| `organizations` | join → organization-members | — | read-only view |
| `legacy` (group, hidden/collapsed) | createdAt, display opt-ins, motivation, activeFlag, mergedFromWpIds | `post_date`, `da_member_display`, `da_member_motivation`, status `active` | kept for traceability, can be dropped later |

Dropped: `da_member_rate` (hourly rate, 2 rows), theme colour fields (`da_*_color`, `da_sidebar`), recaptcha, Yoast meta, `_validate_email`, `da_new_notified`, `da_member_cancel` (always 0).

### 2.5 `organizations` fields

Same building blocks as members: `legacyWpId`, `memberNumber` (`da_community_id`), `name`, `slug`, `profileStatus` (copied 1:1),
`partnerStatus` (select hasMany: `partner`/`premium`/`education`; drop the legacy `active`), `about`, `legacy.logoWpId`, `addresses[]`, `phones[]`,
`links[]`, `portfolio[]`, `documents[]`, `categories`, plus a `people` join → organization-members. Portfolio and documents follow the same pattern as on members (WP ids only).

### 2.6 `organization-members` fields

`organization` (rel, required), `member` (rel, required), `role` (`member` | `admin`), `legacyKey` (text, unique: `"<memberWpId>:<communityWpId>"`).
A unique compound index on (organization, member) gives one row per pair. The WP admin and member links are folded together, so admin implies member.
A separate collection, rather than a relationship array on either side, keeps a role per link, can be queried from both sides via
`join` fields, and makes "who may edit this organisation" a simple access check later.

### 2.7 Shared building blocks (Proposed)

- `src/fields/legacyWpId.ts`: field factory (number, unique, index, `admin.readOnly`, `admin.position: 'sidebar'`).
- `src/fields/contact.ts`: the `addresses`, `phones`, `links` and `portfolio` arrays used by both members and organisations.
- Schema changes are added as normal Payload migrations in `src/migrations/`. Only the **data import** lives in `migration/wordpress/`.

---

## 3. Transformation rules

### 3.1 Profile status: copied as-is

What `pending` means in WordPress is unknown (it mixes applications, former members, inactive members and newsletter
contacts). So nothing is interpreted during the migration:

- `post_status` is copied 1:1 into `profileStatus` (`publish` / `pending` / `draft` / `private`) on members and organisations.
  Only `publish` profiles are shown publicly, as in WordPress.
- **All** profiles are migrated, including the 560 newsletter-only contacts (pending, no login, status only `newsletter`).
- `deathYear` is migrated as a field; it doesn't change the status.

Once designaustria explains what the statuses mean, a membership state can be derived inside Payload from `profileStatus`,
the status flags and the login link, with no re-import needed.

### 3.2 Splitting `da_member_status` (Proposed)

The one multi-checkbox becomes separate fields:

| WP value | Payload |
|---|---|
| `standard`, `yp`, `student`, `retiree` | `tier` = `standard` / `youngProfessional` / `student` / `retiree` |
| `community` | `tier` = `corporate` (company contact or colleague) |
| `institute` | `tier` = `education` |
| `honorary` | `honorary` = `member` |
| `president` | `honorary` = `president` |
| `team` | `functions` includes `staff` |
| `board` | `functions` includes `board`; `boardTerms` from `da_member_board` |
| `bildrecht` | `bildrecht` = true |
| `newsletter` | `newsletter` = true |
| `active` (legacy) | `legacy.activeFlag` = true (meaning unknown, kept so nothing is lost) |

`tier` is single-valued. 6 profiles have two tier flags (for example `standard` + `community`). Rule: a `community` link wins
(they're a corporate contact); otherwise keep the first and log it for review.

### 3.3 Relationship field formats

`da_member_community`, `da_member_community_admin` and every ACF post-object or gallery field: accept both a PHP-serialised array
and a bare ID. One `parseIdList()` helper in `lib/` handles both and is unit-tested.

### 3.4 Categories (Proposed)

Members and organisations reference WP `category` terms (focus areas and regions, e.g. "Wien"). Import only the terms actually
used by members and organisations into a new `categories` collection (with `legacyWpId` and `parent`), so news and events can
reuse it in their own migration later. Terms that no longer exist (e.g. id 174) are logged and skipped.

### 3.5 Text cleanup

- Decode HTML entities (`HFA-Studio GmbH &amp; Co KG`).
- Trim whitespace; empty string → `null`.
- Country: keep the ISO code if present, otherwise map free text ("Österreich", typos like "Österrich", Austrian states → `AT`),
  and log anything unmapped. `scripts/analyze/check-helpers.ts` lists unmapped values for each new dump.
- Phone type `fax` (198 rows, no longer an ACF choice) is kept as its own type.
- URLs: add `https://` where it's missing; log invalid ones.

---

## 4. Duplicate handling

The rules come from the duplicate analysis in §3 of 01-analysis.md. They're applied in the extract stage, so the JSON that import reads is already deduplicated.

| Pattern | Rule |
|---|---|
| `000000-N` placeholder collisions | Not duplicates. Import all; `memberNumber` empty. |
| Bulk copy (IDs 25015–25022) | **Merge** into the original: profile content from the original, `user` from the copy, `tier` from the copy, `honorary` from the original. Record the copy's id in `legacy.mergedFromWpIds`. |
| Re-registration | **Merge** into the newer profile (it has the login); the old profile's id goes to `mergedFromWpIds`. |
| Duplicate Post clones | Per case: merge if it's the same person, otherwise `unlinkUser` when the clone kept the original's login. |

The decisions live in `config/merges.json`, reviewed and committed, so reruns are deterministic:

- `merges`: `{ keep, mergeFrom, takeFromMerged?, reason, review? }`. `takeFromMerged` lists fields copied from the merged
  posts (e.g. `user`, `tier` for bulk copies); everything else comes from `keep`.
- `unlinkUser`: `{ member, reason }` drops a wrong login link (member 31740, a clone of another person that kept user 231).
- `review: true` marks a provisional decision; the extract prints it as a warning on every run until it's confirmed.
  Currently provisional: users 173 and 510 (each linked to two profiles of what looks like one person) and member nr 110001.
- Organisation links of a merged-away profile move to the profile that's kept.

The extract fails if a rule points to a profile that doesn't exist, or if a login would still be linked to two members.

---

## 5. Decisions needed before building

These come from §8 of 01-analysis.md. They block only the parts noted.

1. **Newsletter-only contacts** (560): should they live in Payload at all, or only in the newsletter tool? Current decision:
   migrate them as members with `newsletter = true` (§3.1). Doesn't block the build; they can be removed or moved later.
2. **Fee collection**: is there an external system (accounting tool or SEPA export) that reads IBAN and frequency? Decides whether `billing` should be authoritative in Payload or a sync target.
3. **Community admin rights**: label only, or edit rights? Doesn't block the import (the role is migrated either way); it blocks access control.
4. **Passwords**: see §6.

---

## 6. Passwords and first login

WP hashes can't be checked by Payload's local strategy. The real dump may contain two formats: phpass (`$P$…`, every row in
the anonymised dump) and WordPress ≥ 6.8 bcrypt (`$wp$2y$…`).

**Proposed: transparent upgrade**
1. Import each user with a random, unusable Payload password and store the WP hash in `legacyPasswordHash` (hidden, staff can't read it).
2. A custom login endpoint first tries the normal Payload login. If that fails and `legacyPasswordHash` is set, it verifies the
   password against the WP hash (phpass or `$wp$` bcrypt). On success it sets it as the Payload password, clears
   `legacyPasswordHash`, and logs the user in.
3. "Forgot password" works as normal for everyone.
4. After N months, clear any remaining legacy hashes; those users use "forgot password".

The import writes the WordPress hash on every run, so WordPress stays the source of truth until cutover. Once the login
endpoint exists, the import must not put a hash back on a user who has already logged in on the new site (step 4).

Alternative: drop the hashes and send everyone a "set your password" mail at launch. It's simpler, but every member has to act
at launch, and outdated email addresses lead to support requests.

---

## 7. Pipeline

```
00-load-dump.sh      SQL dump → MySQL (container)
extract/*.ts         MySQL → .data/wp-extract/*.json        (clean, deduplicated, Payload-shaped, no Payload IDs)
import/*.ts          JSON  → Payload Local API               (upsert by legacyWpId, resolve relations by legacyWpId)
verify/*.ts          WP counts ↔ Payload counts, report     (fails on mismatch)
```

- **Language:** TypeScript, run with `tsx` (`npm run wp:extract|wp:import|wp:verify`). `payload run` drops command-line flags,
  so the scripts load `.env` and the Payload config themselves (`scripts/lib-env.ts`).
  New dev dependency: `mysql2`. PHP unserialise is a small in-house parser in `lib/` (plus tests), since the values are simple.
- **Extract** is pure: same dump → byte-identical JSON (sorted keys and rows). Every record carries `legacyWpId`. Warnings
  (dangling refs, unmapped values, merges) go to `.data/wp-extract/_report.json`.
- **Import order:** `categories` → `users` → `organizations` → `members` → `organization-members`.
- **Upsert:** `find({ where: { legacyWpId: { equals } } })`, then `update` or `create`. Batched, with `--dry-run` and `--only=<collection>`.
  A rerun never duplicates; it updates changed values.
- **Records removed in WordPress** between runs aren't deleted automatically; `verify` lists them.
- **Media:** not imported in this migration. Extract and import only carry the WP attachment ids (`*WpId` fields), see §11.
- **Side effects off:** imports pass `context: { isMigration: true }`, and hooks that send emails or ping external services must
  skip when that flag is set. Payload's verification and welcome emails are disabled for imported users.

### Folder additions

```
migration/wordpress/
├── config/merges.json            reviewed duplicate merges
├── lib/                          mysql client, php-unserialize, parseIdList, upsert, mappers
├── scripts/lib-env.ts            Payload startup: local-DB guard, no schema push, migrations up-to-date check
├── scripts/extract/              run.ts + one module per collection
├── scripts/import/run.ts         all collections in dependency order, --dry-run / --only=
└── scripts/verify/run.ts
```

---

## 8. Environments and cutover

1. **Develop** against the anonymised dump and a local Postgres. The anonymised data is enough to build and test everything except real password checks.
2. **Staging rehearsal** with a fresh *real* dump on a staging DB. The real dump is handled only on staging and the machine running
   the import, and it is never committed (`.data/` is gitignored).
3. **Cutover:** freeze WP (maintenance mode, or at least no new registrations or profile edits), take a final dump, run load → extract →
   import → verify on production, then set up redirects from old member and organisation URLs (`/member/<slug>` → new route).
4. Because the import is idempotent, a rerun with a newer dump only adds and updates, so a last-minute delta run before go-live is cheap.

---

## 9. Verification

`verify/counts.ts` checks, and fails on any mismatch:
- users: WP count = Payload count; every WP admin has role `admin`
- members: WP count − merged = Payload count; every merged id appears in some `mergedFromWpIds`
- every member→user link from WP exists in Payload (except the logged dangling ones)
- organisation links: equal to `organization-members.json` (297 rows on the anonymised dump, 130 with role `admin`, after merges)
- spot checks: 20 random members, rendered side by side (WP JSON vs Payload doc) in a report

---

## 10. Build order

1. Schema: `legacyWpId` and contact field helpers; `users` roles and access; `members`, `organizations`,
   `organization-members`, `categories`; Payload migration.
2. `lib/` and unit tests (`parseIdList`, unserialise, status split, merges).
3. Extract and import for categories, users, organisations, members and links, using the anonymised dump. Verify.
4. Legacy login endpoint (§6).
5. Staging rehearsal with the real dump, then cutover.

Steps 1–3 can start now; none of the open decisions in §5 block them.

---

## 11. Later: media files (not part of this migration yet)

The people and organisations migration runs **without files**. Profiles are imported with the WordPress attachment ids
(`legacy.avatarWpId`, `legacy.logoWpId`, `legacy.studentProofWpId`, `portfolio[].imageWpIds`, `documents[].fileWpId`), so a separate media step can
attach the files afterwards without re-extracting or touching the rest of the data.

**This step still has to be done**, and it must be finished before go-live if the new site shows member or organisation profiles.
Otherwise profiles launch without avatars, logos and portfolios.

What's already known, so the step can be picked up later. There's no uploads export, but the files can be inferred from the
dump and fetched from the live site (numbers: `scripts/analyze/05-media.sql`):

- URL = `https://www.designaustria.at/wp-content/uploads/` + `_wp_attached_file`. Uploads are flat (no `yyyy/mm`), which
  was confirmed with a request for a public logo. For images WordPress downscaled (`-scaled`), fetch `original_image` from
  `_wp_attachment_metadata` instead (110 files).
- **Manifest:** `extract/` writes `.data/wp-extract/media-manifest.json` with only the attachments referenced by migrated members and organisations:
  attachment id, path, URL, mime type, role (`image` / `portfolio` / `cert` / `document`), owner. That's about 12,000 files and 5–6 GB,
  of which 11,000 are portfolio images. The other ~10,500 attachments in WP belong to news, events and the shop, and are left out.
- **`scripts/fetch-media.ts`** downloads into `.data/wp-uploads/<path>`:
  - Idempotent: it skips files that already exist with the same size. Use `--refresh` to recheck with `If-Modified-Since`.
  - Polite: 2–4 parallel requests, retry with backoff, run off-hours.
  - Reports 404s and other failures to `.data/wp-extract/_media-report.json`. Missing files are logged and skipped.
- **Attach:** `role = cert | document` → `private-files` (staff-only); everything else → `media`. The alt text comes from the WP attachment's
  alt meta, falling back to the title. Upserted by `legacyWpId` (the attachment id). Then replace the `*WpId` fields with real upload fields that point to the imported files.
- WooCommerce downloads (`woocommerce_uploads/`) are shop-only and out of scope.
- At cutover the fetch runs again against the final dump, which only downloads new files.
- Needs: a new `private-files` upload collection (staff-only) and upload fields on `members` and `organizations`.

**Open before starting:**
- Is it OK to download about 12,000 files (5–6 GB) from the live site, and when? Or can the hoster provide the `wp-content/uploads` folder instead?
- Are certificates publicly reachable by URL today? If so, that's a privacy issue on the current site regardless of the migration.
