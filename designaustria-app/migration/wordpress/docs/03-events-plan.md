# Migration plan: WordPress → Payload (events)

Status: **steps 1–3 of §7 built** (schema, mappers, extract/import/verify), and run on the anonymised dump; results in §5.
The frontend (step 4) and the media step (§6) are still to do. Same approach as [02-plan.md](02-plan.md) (people and
organisations), and it reuses that pipeline. All numbers are from the anonymised dump `2026-11-09_wordpress-database_export.sql`.

The existing `events` collection (title, date, location, media, description) was a placeholder. It's **replaced** by the
model in §3, which is designed around the WordPress data. Its frontend (`/[locale]/events`, `components/Event`) is
rewritten too.

Legend: **Proposed** = default we'll build unless someone objects. **Decide** = needs input before building that part.

---

## 1. Scope

**In scope:** CPT `event`, with its ACF fields, categories, DE/EN translations and links to shop products.

**Deferred**, the same way as for members (02-plan §11): image and document files. Events are imported with their WordPress
attachment ids, and the media step attaches the files later.

**Out of scope:** the shop products that events link to (`da_product`), which belong to the shop migration. Also news posts,
publications and pages.

---

## 2. What's in WordPress

| | Count | Notes |
|---|---|---|
| Event posts | 1,448 | 1,421 `publish`, 14 `draft`, 8 `private`, 4 `pending`, 1 `trash` |
| Language | 1,388 DE, 33 EN | 35 Polylang translation groups. 31 EN events have a DE partner, 2 don't |
| By year (published) | 2011–2026 | 140–254 a year up to 2016, falling to 33–44 a year from 2021. **4 are still upcoming** |
| Type (`da_event_type`) | 1,346 `intern`, 102 `extern` | Labels: "designaustria/designforum" and "Extern/Mitglieder" |
| Gallery (`da_images`) | 886 events, ~1,290 images | No featured images: `_thumbnail_id` is never set |
| Documents (`da_documents`) | 35 events, 41 files | |
| Web links (`da_event_web`) | 1,065 events | Repeater with up to 4 URLs, some of them `mailto:` |
| Product (`da_product`) | 47 events | Ticket in the shop, mostly published products |
| Badge (`da_badge_name`) | 79 events | Free text, e.g. `#DenkWeiter` (61), `Programm2024` |
| Visibility (`da_linked`) | 310 events | `all` = everywhere, `nostart` = not on the homepage, `none` = nowhere. Missing on older events, which means `all` |
| Members only (`da_members_access`) | 310 events | Always empty, so it isn't used |
| Body (`post_content`) | | 273 Gutenberg, 1,046 classic HTML, 102 empty. 58 have inline images from `wp-content/uploads` |
| Slug | | Real per language on the live site (`orf-lange-nacht-der-museen-2`, EN `orf-long-night-of-museums-2025`), but **anonymised to `post-<n>`** in the dump. 93 events also have a `_wp_old_slug` (not anonymised) |

### Two generations of event details

The details (place, prices, opening hours) are stored in two different ways, depending on when the event was created:

1. **2011–2020 (the old-site import, `da_old_import` = 2021-01-26):** a single WYSIWYG field `da_event_import` ("Freitext")
   with two markers, for example
   `<!--place-->designforum Wien<br />MQ, Museumsplatz 1<br />1070 Wien<!--costs-->Regulär: 45 Euro …`.
   There are 1,150 `place` and 1,040 `costs` sections, and the HTML is mixed (`<br>`, `<div>`, `\n`).
2. **From 2021: the ACF group `da_event_details`** (294 events). It has:
   - `location` (venue name), `street`, `number`, `zip`, `city`. Some fields are filled in the wrong box, e.g. a street in `zip`.
   - `admission`, a repeater of `type` (`regulär`, `ermäßigt`, `ermäßigt für designaustria-Mitglieder`, `sonstige`) +
     `title` (only for `sonstige`) + `amount` (free text such as `kostenlos`, `90`, `2 €`).
   - `open`, the opening hours as free text.
   - `misc`, notes as free text.
   - `show_admission` / `show_open`, which control display. **They're used:** prices are hidden on 203 events and shown on 69.
   - An older variant of the same group on 26 events, with fixed fields (`admission_full/reduced/members`,
     `open_weekday_from/to`, `open_weekend_from/to`).

A few 2021+ events also still have text in `da_event_import`.

### Data quality

- 14 events end before they start, mostly typos in the month or year (e.g. 18.11.2016 → 18.10.2016).
- 3 events (published or private) have no start date.
- Dates are stored as Vienna local time with no time zone (`2026-12-04 12:00:00`).

---

## 3. Target: a new `events` collection

The collection keeps the slug `events` (and the `/events` route), but its fields are designed from scratch. The table is
recreated by a Payload migration. Events already entered in the old model are test data and are dropped.

### 3.1 Fields (Proposed)

| Field | Type | From WP | Notes |
|---|---|---|---|
| `title` | text, localized, required | `post_title` (+ EN partner) | |
| `slug` | text, **localized**, indexed, unique per locale | `post_name` of the DE post / of its EN partner | §4.7 |
| `startsAt` | date + time, required, indexed | `da_event_from` | |
| `endsAt` | date + time | `da_event_to` | |
| `type` | select `internal` / `external` | `da_event_type` | "designaustria/designforum" or "Extern/Mitglieder" |
| `categories` | relationship → `categories`, hasMany | `da_category` | reuses the collection the member migration created (§3.2) |
| `venue` | group: `name` (localized), `street`, `zip`, `city`, `country` | `details.location`, `street`+`number`, `zip`, `city`, or `<!--place-->` (§4.4) | all optional: empty on ~250 events. Reuse the address building block from members if it fits |
| `admission` | group: `show` (checkbox), `prices[]` (`kind` `regular` / `reduced` / `members` / `other`, `label` localized, `amount` text), `note` (textarea, localized) | `details.show_admission`, `details.admission[]` and the old fixed fields, `<!--costs-->` → `note` | `amount` stays text (`kostenlos`, `90`, `2 €`). `note` is mostly for the free-text prices of the old events |
| `openingHours` | group: `show` (checkbox), `text` (textarea, localized) | `details.show_open`, `details.open`, or the weekday/weekend fields written out | |
| `notes` | textarea, localized | `details.misc` | |
| `links` | array: `url`, `label` (optional) | `da_event_web[]` | `mailto:` is kept |
| `badge` | text | `da_badge_name` | |
| `visibility` | select `everywhere` / `notOnHome` / `hidden` | `da_linked` (missing → `everywhere`) | |
| `gallery` | `mediaField({ hasMany: true })` | `da_images` | the first item is the cover image. Filled in the media step |
| `documents` | upload → `media`, hasMany | `da_documents[]` | filled in the media step |
| `description` | rich text, localized | `post_content` → Lexical | |
| `legacyWpId` | number, unique | DE post id | `legacyWpIdField` |
| `legacy` | group, read-only: `enWpId`, `imageWpIds[]`, `inlineImageWpIds[]`, `documentWpIds[]`, `productWpId`, `wpStatus`, `rawPlace`, `rawCosts` | | The ids let the media and shop steps attach things later. The raw texts are for checking the parsing |

`da_members_access` (always empty) and `da_old_page` / `da_old_linked` (ids from the old site) aren't migrated.

Admin: `useAsTitle: 'title'`, columns `title`, `startsAt`, `type`, `visibility`, default sort `-startsAt`. When staff leave
`slug` empty, it's made from the title (not for the migration, which brings the WordPress slugs). Access stays as it
is today: anyone may read, only staff may write. `hidden` events are filtered out by the frontend queries, not by access.

### 3.2 Categories (Proposed)

Events use the same WP `category` taxonomy. Their main branches are **Programm** (Ausstellung, Vortrag, Workshop, Wettbewerb, …)
and the **regions** (Wien, Steiermark, …), and part of that is already imported for members. Plan:

- `extract/categories.ts` collects the used term ids from members, organisations **and events**, so the
  `categories` collection gets the terms that events use too. They keep the same `legacyWpId`.
- EN events point to English terms (the `Program` branch, `Vienna`, …). These are mapped to their DE partner through Polylang's
  `term_translations`, the way `categories.ts` already does for titles, so an event never points to an English duplicate.
- Update the comment in `Categories.ts`: it no longer covers only members and organisations.

---

## 4. Transformation rules

### 4.1 Which events

- All years, back to 2011. Past events are shown on the site as an archive (§7 step 4).
- `publish` (1,421) and `private` (8). Private events are imported with `visibility = hidden`, so staff can still find
  them in the admin. They get no redirect, since they were never public.
- `draft`, `pending` and `trash` (19) aren't migrated.
- Events without a start date (3, one of them private) are logged and skipped.

### 4.2 Languages (Proposed)

- The DE post is the document. Its EN partner from the Polylang group becomes the `en` locale of the same document: `title`,
  `venue.name`, `description`, `admission.note`, `admission.prices[].label`, `openingHours.text`, `notes`. Its own ACF fields (dates, prices,
  images) are ignored, and differences from the DE post are logged.
- Without an EN partner, the `en` locale stays empty and the frontend falls back to DE (Payload `fallback`).
- The 3 EN events without a migrated DE partner: their EN post is the document, and its texts are copied to the `de` locale as well,
  so they don't show up untitled in the DE admin and on the DE site. `legacyWpId` is then the EN post id. Each copy is logged.
- 3 DE events have an EN partner that is `pending`. It isn't used (logged), so their `en` locale stays empty.
- `admission.prices[].label` in English is only taken when the EN post has as many price rows as the DE post (otherwise logged).

### 4.3 Dates (Proposed)

- WP times are Vienna local time. They're converted to UTC with `Europe/Vienna` (so DST is right) before they're stored.
- If `endsAt` < `startsAt`, the end is set to empty and the event goes on a list in `_report.json` for staff to fix by hand. We don't guess.
- Events that have a date but no time are left as they are; there are none in the dump with a midnight start.
- The Vienna → UTC conversion goes in `lib/dates.ts`, not in the event mappers: news and other content types will need it too.

### 4.4 Place and costs from the old free text (Proposed)

`<!--place-->…<!--costs-->…` is split on the markers. Then:
- **place:** HTML → lines (`<br>`, `<div>`, `\n`), entities decoded, empty lines removed. Line 1 → `venue.name`. If the last line
  starts with a postcode (`^\d{4,5} `), it becomes `venue.zip` + `venue.city`, and the line before it `venue.street`. Anything else that's left is
  added to `venue.name`. Anything that doesn't fit this pattern (e.g. "online über Zoom") goes entirely to `venue.name`.
  Also read: a last line that is only a country ("Deutschland" → `venue.country`), a country prefix on the postcode
  (`D-10999`), street and postcode on one line, and the whole place on one line ("MAK, Stubenring 5, 1010 Wien").
  On the dump this splits 87% of the place texts (991 of 1,135); `check-helpers.ts` lists the ones it can't.
- **costs:** HTML → plain text with line breaks → `admission.note`, and `admission.show = true`.
- Text without markers (239 events have it empty, a few have only a note) goes to `admission.note`.
- The original text is always kept in `legacy.rawPlace` / `legacy.rawCosts`, and `verify` reports how many could be parsed.

The many repeated "designforum Wien / MQ, Museumsplatz 1 / 1070 Wien" places suggest a `venues` collection later.
It's not needed for the migration (§8).

### 4.5 Structured details (Proposed)

- `admission[].type` → `kind`: `Normpreis` (82 rows, the most common) and `regulär` → `regular`, `ermäßigt` → `reduced`,
  `ermäßigt für designaustria-Mitglieder` → `members`, `sonstige` → `other`. `title` becomes `label` (on EN posts it holds
  e.g. "Price", "Reduced price").
- Old fixed fields: `admission_full` → `regular`, `admission_reduced` → `reduced`, `admission_members` → `members`.
  `open_weekday/weekend_{from,to}` → `openingHours.text` = "Mo–Fr 10:00–19:00\nSa–So 13:00–18:00" (only when `_bool` = 1).
  Some events have both variants; then the repeater and the `open` text win.
- Street + number are joined. Obvious swaps (e.g. a street in `zip`) are logged, not corrected.

### 4.6 Body text → Lexical (Proposed)

- Two shared modules, so news, publications and pages reuse them:
  - `lib/wp-html.ts` (extract): WordPress HTML → clean HTML, which goes into `events.json`. Removes the Gutenberg comments
    (`<!-- wp:… -->`), and gives classic-editor posts WordPress's automatic paragraphs (`wpautop`; ~220 classic posts have no
    `<p>` at all). Also strips attributes, collapses whitespace (`&nbsp;` chains), and repairs links: `mailto: x`, `http:/x`
    and trailing spaces are fixed, and links that still aren't URLs are dropped with their text kept (Payload rejects URLs
    with spaces).
  - `lib/html-to-lexical.ts` (import): clean HTML → Lexical with `convertHTMLToLexical` from `@payloadcms/richtext-lexical`.
    It runs in the import because it needs the Payload config (which editor features exist).
- Result on the dump: paragraphs, headings, lists, quotes, links, line breaks and separators.
- Columns and groups are flattened to their content. `table` (4), `buttons` (2) and `video` (1) are turned into paragraphs or links and logged.
- Inline images and galleries (58 events) **stay in the text, in the same place**. The files don't exist in Payload yet when
  the events are imported, so it happens in two passes:
  1. **Extract:** each `<img>` (and each image of a `wp:gallery`) becomes a placeholder paragraph `[[wp-image:<attachment id>]]`,
     followed by its caption (`<figcaption>`) as a normal paragraph. The attachment id comes from the Gutenberg block
     (`{"id":123}`), the `wp-image-123` class, or, for classic HTML with only a `src`, a lookup of `_wp_attached_file`. Images that
     can't be resolved are logged and dropped. The ids also go into `legacy.inlineImageWpIds`.
  2. **Media step:** once the files are uploaded, each placeholder paragraph is replaced with a Lexical `upload` node pointing to the
     `media` doc. The alt text comes from the attachment, as for members.
  - Until the media step has run, the placeholders are visible in the text. `verify` reports how many are left, and
    must report 0 before go-live.
  - Needs Lexical's `UploadFeature` for `media` in the editor config (on by default, check that it isn't removed).
- `acf/product` (2) and `acf/newsletterform` (1) blocks are dropped and logged. The product link already comes from `da_product`.
- Shortcodes are logged and left as text. Only one is real (`[modula id=…]`, a gallery plugin); things like `[ding]` are text.

### 4.7 Slugs, URLs and redirects

The live site has a DE and an EN URL per event, each with its own slug (Polylang makes EN a separate post):

| | Live site | New site |
|---|---|---|
| DE | `/veranstaltung/orf-lange-nacht-der-museen-2/` | `/de/events/orf-lange-nacht-der-museen-2` |
| EN | `/en/veranstaltung/orf-long-night-of-museums-2025/` | `/en/events/orf-long-night-of-museums-2025` |

For now (see §9) this DE/EN structure is kept as it is:

- **Slugs:** `slug` is localized. `slug.de` = `post_name` of the DE post, `slug.en` = `post_name` of its EN partner. Without an EN
  partner, `slug.en` stays empty and the EN page uses the DE slug (locale fallback). WordPress's `-2` suffixes are kept, so no
  extra redirects are needed. This is the same as members, which also keep `post_name`.
- **Slug checks in the extract:** an empty slug or a duplicate within a locale is made unique (`-<legacyWpId>`), logged, and gets
  its own redirect.
- **Redirects** go in `redirects()` in `next.config`, shared with members. Because the slugs are kept, two pattern rules cover
  all events, with no database lookup and no long list:
  - `/veranstaltung/:slug` → `/de/events/:slug`
  - `/en/veranstaltung/:slug` → `/en/events/:slug`
- **Individual redirects:** the extract writes them only for the exceptions: slugs changed by the extract, and `_wp_old_slug`
  values (93 events; WordPress redirects these to the current URL today). Old slug → current slug, in its locale. They go in
  one shared `redirects.json` with an `entity` field (`event`, later `member`, `news`, …), not a file per content type, so
  `redirects()` loads a single file. The slug uniqueness check (`-<legacyWpId>`) is a shared helper in `lib/` too.
- **Hidden events** (the 7 private ones) get no individual redirects. A pattern redirect to a hidden event gives a 404 on the new site, the same as on the old one.
- **Testing:** the anonymised dump only has `post-<n>` slugs, so locally the slugs and pattern redirects are tested with
  placeholder data. Whether the real slugs come through, whether there are duplicates, and whether the `_wp_old_slug`
  redirects work can only be checked in the staging rehearsal with the real dump. `verify` then fetches a sample of old URLs
  and checks that they land on an event (not built yet).
- `redirects.json` is written to `.data/` (gitignored). For cutover it has to go somewhere `next.config` can read it in production,
  from the extract of the real dump (§7 step 5).

---

## 5. Pipeline

This extends the existing `wp:extract` / `wp:import` / `wp:verify`, so there's no separate tool. Import and verify are split
into one step per entity (`scripts/import/steps/`, `scripts/verify/steps/`); events is a step in each.

- **Extract** stays one run over all entities: categories collect the terms used by members, organisations and events.
  `scripts/extract/events.ts` → `.data/wp-extract/events.json` and `redirects.json` (§4.7). Event-specific mapping is in
  `lib/event-mappers.ts`; shared helpers are `lib/dates.ts` (Vienna → UTC), `lib/slugs.ts`, `lib/polylang.ts` and
  `lib/wp-html.ts`. All have unit tests.
- **Import:** `scripts/import/steps/events.ts`, the last step. It writes the German texts, then the English ones in the `en`
  locale (prices with their row IDs, so the German labels stay). The full run wipes imported events first (those with a
  `legacyWpId`). **Events created by staff on the new site, without a `legacyWpId`, are kept**, like the team's accounts.
  Their category links are lost, though, because the full run also recreates the categories. `--only=events` upserts by
  `legacyWpId` without wiping, like the other steps.
  - Proposed: since nothing references events, `--only=events` could also wipe and recreate only the events, so an event
    that drops out of the extract (e.g. now a draft) doesn't stay behind. That needs a per-step flag (`replaceOnOnly`);
    steps that other records point to (`categories`, `users`) must stay upsert-only. Not built.
- **Verify:** `scripts/verify/steps/events.ts`: all extracted events and no others, private ones `hidden`, dates and categories
  match, descriptions present, English title and slug on every translated event and on no others, and a field-by-field
  spot check of 20 events in German and 10 in English. It also prints the place parse rate and how many image placeholders are left.
- `analyze/check-helpers.ts` covers events too: unknown types, `da_linked` values, admission types and links, and place
  texts the parser can't split.

Result on the anonymised dump: **1,396 events**. That's 1,396 DE posts (1,388 published + 8 private) plus 3 English-only, minus
3 without a start date; the earlier estimate of ~1,427 counted the EN posts as separate events. 33 have an English version, 7
are hidden, 14 had their end date cleared. 32 individual redirects (from `_wp_old_slug`). For the media step: 1,265 gallery
IDs, 82 inline image IDs (placeholders in 49 descriptions) and 41 document IDs; 51 events link to a shop product. A full
import of everything takes under a minute, about 10 s of it for events.

---

## 6. Media step (addition to 02-plan §11)

The media step (still to be built) also takes event files: `media-manifest.json` gets `role = event-image | event-inline-image | event-document`
with `owner = event:<legacyWpId>`. That's about 1,300 extra images (+ inline images) on top of the ~12,000 member files. After
the upload, `gallery` and `documents` are filled from `legacy.*WpIds`, and the inline image placeholders are replaced (§4.6).
Event documents (programme PDFs, press releases) go in the public `media`, since they're public on the current site.

---

## 7. Build order

1. ✅ Schema: `src/collections/Events.ts` with the model in §3, and the migration `20261126_123053_events_rebuild` (deletes
   the old test events, then rebuilds the table). The `/events` page and `components/Event` show title, date (Vienna time)
   and venue, newest first, without hidden events.
2. ✅ `lib/event-mappers.ts`, `lib/dates.ts`, `lib/slugs.ts`, `lib/wp-html.ts`, `lib/html-to-lexical.ts` + unit tests.
3. ✅ Categories extract extended to event terms; `extract/events.ts`; the `events` import and verify steps. On the anonymised dump and a local Postgres.
4. Frontend (not part of the migration, but needed before go-live): a new events list with upcoming/past, filters on
   categories and type, pagination (1,400 events), respect for `visibility`, and a detail page `/[locale]/events/[slug]` that looks up `slug` in the current locale.
5. At cutover: together with members (02-plan §8), in the same run, + redirects.

Steps 1–3 don't depend on the open decisions in §9.

---

## 8. Later / not now

- A `venues` collection (repeated places such as designforum Wien), deduplicated from `venue`. Since the model is new anyway,
  it could be done right away instead of the `venue` group, but deduplicating ~1,150 free-text places means manual review.
- `product` as a real relation to the Vendure product, once the shop is migrated (`legacy.productWpId` is ready for it).
- Links to members or organisations (e.g. "DA-Mitglied Otmar Grissemann" in the text, or `extern` events by members): there's no
  structured field in WP for this, so it would be new work.

---

## 9. Open questions

1. **URL structure on the new site.** Do we keep the slug per language and the path segment `/events` for both languages,
   or change it, e.g. a translated segment (`/de/veranstaltungen/…`) or one shared slug for both languages? That's a site-wide
   choice (members, events, later news), not something only events decide.
   *For now:* `/de/events/<de-slug>` and `/en/events/<en-slug>` with the WordPress slugs kept, plus pattern redirects from the
   old URLs (§4.7). Another shape later only means changing the route and adding one more redirect rule.
