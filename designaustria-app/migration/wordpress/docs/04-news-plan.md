# Migration plan: WordPress → Payload (news)

Status: **steps 1–4 of §7 built** (schema, mappers, extract/import/verify, list and detail pages), and run on the
anonymised dump; results in §5. The media step (§6) and the cutover are still to do. Same approach as
[03-events-plan.md](03-events-plan.md), and it reuses that pipeline and its shared helpers in `lib/` (dates, slugs and
redirects, Polylang, DE/EN document picking, WordPress HTML → Lexical). All numbers are from the anonymised dump
`2026-11-09_wordpress-database_export.sql`.

There was no news collection in Payload, so this adds a new **`posts`** collection and its frontend. In code the news is
called posts (`posts` / `Post`, like `events` / `Event`); the URLs stay `/news` (§4.6), and the admin labels the
collection "News".

Legend: **Proposed** = default we'll build unless someone objects. **Decide** = needs input before building that part.

---

## 1. Scope

**In scope:** WordPress posts (`post_type = 'post'`, "Neues" on the live site), with their ACF fields, categories,
DE/EN translations and redirects.

**Deferred**, as for members and events: image and document files. News is imported with its WordPress attachment ids,
and the media step attaches the files later (§6).

**Out of scope:** comments (there are none on posts), Yoast SEO data (§8), publications and pages.

---

## 2. What's in WordPress

| | Count | Notes |
|---|---|---|
| Posts | 1,953 | 465 `publish`, **1,412 `pending`**, 4 `private`, 14 `draft`, 7 `auto-draft`, 51 `trash` |
| Language | 444 DE + 21 EN published | 19 Polylang translation groups. 16 published EN posts have a published DE partner, 5 don't. 2 published DE posts have an EN partner that is a `draft` |
| By year (published) | 2011–2026 | 17–57 a year. 118 since 2021, 15 so far in 2026. No scheduled (future) posts |
| Pending | 1,412 | 2011–2020, almost all (1,394) from the old-site import (`da_old_import` 2020-10 / 2021-02). **Not public:** their Yoast permalink is `/?p=<id>` |
| Old-site import | 371 of the 465 published | The rest (94) were written on the current site |
| Images (`da_images`) | every post has at least one | 824 images on published posts (max 22), 1,739 on pending ones. `_thumbnail_id` is set on only 32 published posts |
| Documents (`da_documents`) | 114 published posts, 497 files | Repeater. Plus 127 pending posts with 329 files |
| Categories | same `category` taxonomy | Mostly the **Programm** branch (Wettbewerb, Ausstellung, Vortrag, …) and the **regions** (Wien, Steiermark, …), like events. Also `Design`, `ExpertClusters`, `Jobs` (4), `Startseite` (2) |
| Tags (`post_tag`) | 59 links, on ~20 published posts | e.g. `wedesignaustria`, `Staatspreis`, `Next Gen Design` |
| Badge (`da_badge_name`) | 328 published | Almost all `DA` (321); also `#DenkWeiter`, `New European Bauhaus`, `Programm2024` |
| Visibility (`da_linked`) | 167 posts | 112 `all`, 2 `nostart` on published posts. Missing → `all`, like events |
| Members only (`da_members_access`) | 167 posts | Always empty, so not used |
| Excerpt | 1 published post | Teasers have to come from the body |
| Body (`post_content`) | | 107 Gutenberg, 358 classic HTML (published). 36 have no `<p>`. 20 posts with inline images, 3 `acf/product` blocks, 1 embed, a few shortcodes |
| Internal links in the body | 6 to `/neues/…`, 14 to `/veranstaltung/…` or member pages | Covered by the redirects (§4.6) |
| Author (`post_author`) | 7 WP users | Staff accounts. Not shown on the live site |
| Slug | | Real per language on the live site, but **anonymised to `post-<n>`** in the dump, as for events. 6 published posts have a `_wp_old_slug` |

Unlike events, news has no structured details: it's title, date, body, images, documents and categories.

The ACF fields `da_old_page` ("Seitennummer") and `da_old_linked` ("Verlinkung") hold ids from the old site. In this
database they point at unrelated rows (revisions, attachments, ACF fields), so they aren't migrated, as for events.

---

## 3. Target: a new `posts` collection

### 3.1 Fields (Proposed)

The model follows `Events.ts` where the data is the same, so the frontend and the import can share code.

| Field | Type | From WP | Notes |
|---|---|---|---|
| `title` | text, localized, required | `post_title` (+ EN partner) | |
| `slug` | text, localized, indexed, unique per locale | DE / EN slug (§4.6) | made from the title when staff leave it empty, as for events |
| `publishedAt` | date + time, required, indexed | `post_date` (Vienna → UTC) | the date shown on the site and the sort order |
| `categories` | relationship → `categories`, hasMany | `da_category` + the post's `category` terms (§3.2) | |
| `tags` | text, hasMany | `post_tag` names | free-text list, ~20 posts |
| `excerpt` | textarea, localized | `post_excerpt` (1 post) | optional teaser; the frontend falls back to the start of the body |
| `cover` | `mediaField()` | `_thumbnail_id`, else the first `da_images` item | filled in the media step |
| `gallery` | `mediaField({ hasMany: true })` | `da_images` (without the one used as cover) | filled in the media step |
| `documents` | upload → `media`, hasMany | `da_documents[]` | filled in the media step |
| `body` | rich text, localized | `post_content` → Lexical (§4.5) | |
| `badge` | text | `da_badge_name` | free text, like the event badge (§9) |
| `visibility` | select `everywhere` / `notOnHome` / `hidden` | `da_linked` (missing → `everywhere`) | same values as events |
| `legacyWpId` | number, unique | DE post id | `legacyWpIdField` |
| `legacy` | group, read-only: `enWpId`, `authorWpId`, `imageWpIds[]`, `thumbnailWpId`, `inlineImageWpIds[]`, `documentWpIds[]`, `wpStatus` | | for the media step and for checking |

Admin: `useAsTitle: 'title'`, columns `title`, `publishedAt`, `visibility`, default sort `-publishedAt`. Access as for
events: anyone may read, only staff may write. `hidden` items are filtered out by the frontend queries.

The two `cover`/`gallery` fields mirror the live site, where the first image is the large one at the top. Events use only
`gallery` (first item = cover), because no event has a featured image. Since 32 posts set `_thumbnail_id` separately, news
gets an explicit `cover`.

### 3.2 Categories (Proposed)

- `extract/categories.ts` also collects the terms used by migrated news, so the `categories` collection gets them, with
  the same `legacyWpId`. EN terms are mapped to their DE partner through `term_translations`, as for events.
- News has categories in two places: the ACF field `da_category` (serialised ids, empty on ~170 published posts) and the
  normal WP term relationships (`wp_term_relationships`). They agree on 355 of the 469 posts. The union of both is taken,
  **without WordPress's default category** (term 1 "Design", EN 187): WordPress adds it to every post saved without a
  category, and it's the only term on 74 posts with an empty ACF field. It's kept when the ACF field picks it.
  `mergeCategories` in `lib/post-mappers.ts`; the 36 posts where the lists still differ are logged (`post.categories-differ`).
- `Startseite` ("homepage", 2 posts) looks like an old way to put a post on the homepage, and `Jobs` (4) like a job board.
  Both are imported as normal categories for now (§9).

---

## 4. Transformation rules

### 4.1 Which posts

- `publish` (465) and `private` (4). Private posts get `visibility = hidden` and no redirect, as for events.
- `pending` (1,412) aren't migrated: they aren't public on the live site, like pending members. Their texts stay in the
  WordPress dump, which is archived.
- `draft`, `auto-draft` and `trash` aren't migrated.

### 4.2 Languages (Proposed)

Same rules as events (03-events-plan §4.2):

- The DE post is the document; its EN partner becomes the `en` locale: `title`, `slug`, `excerpt`, `body`. The EN post's
  own images, categories and date are ignored, and differences are logged.
- The 5 EN posts without a DE partner: the EN post is the document, its texts are copied to `de` too, and
  `legacyWpId` is the EN post id. Logged.
- EN partners that aren't migrated (the 2 drafts) are ignored, so the `en` locale stays empty and falls back to DE.

### 4.3 Dates (Proposed)

- `post_date` is Vienna local time → UTC with `viennaToUtc` from `lib/dates.ts`. 13 EN posts have a different date
  than their DE partner; the German one is used and the difference logged.
- `post_modified` isn't migrated (Payload's own `updatedAt` starts at the import).
- `_wp_old_date` (55 published posts) only matters for date-based permalinks, which the site doesn't use, so it's ignored.

### 4.4 Images and documents

- `da_images` is a serialised list of attachment ids → `legacy.imageWpIds`. `_thumbnail_id` → `legacy.thumbnailWpId`.
- `da_documents` is an ACF repeater (`da_documents_<n>_da_document`) → `legacy.documentWpIds`, read with `lib/repeater.ts`.
- The media step fills `cover`, `gallery` and `documents` from these (§6).

### 4.5 Body text → Lexical (Proposed)

Reuses `lib/wp-html.ts` and `lib/html-to-lexical.ts`, which already do what news needs: Gutenberg comments
removed, `wpautop` for classic posts, link repair, inline images as `[[wp-image:<id>]]` placeholders for the media step.

News-specific:
- The 3 `acf/product` blocks (a shop product teaser) are dropped and logged, as for events. If the product matters, the
  text usually links to it too; the list in the report lets staff check.
- The 1 embed (a Vimeo `<iframe>`) is turned into a link to the source URL and logged. `wp-html.ts` used to drop iframes
  silently; this applies to all content types now (no event has one).
- **Images from the site before WordPress:** 15 old posts (sponsor-logo walls and the like) have 287 `<img>` tags with
  `/system/assets/…` paths. WordPress has no attachment for them, so they're dropped and logged (`html.unresolved-image`),
  as for the one such event.
- Columns, buttons, spacer and table: handled as for events (flattened, links, logged).
- Links to the old site in the body (`designaustria.at/neues/…`, `/veranstaltung/…`, member pages) are left as they are.
  The redirects send them to the new URLs. Rewriting them to the new paths can come later (§8).

### 4.6 Slugs, URLs and redirects

| | Live site | New site |
|---|---|---|
| DE | `/neues/designaustria-ehrenmitgliedschaft-an-lindinger-und-eisenmenger/` | `/de/news/designaustria-ehrenmitgliedschaft-an-lindinger-und-eisenmenger` |
| EN | `/en/neues/call-for-entries-european-design-awards-2021/` | `/en/news/call-for-entries-european-design-awards-2021` |

The URL shape (`/news` for both languages, slugs kept) follows the interim decision for events (03-events-plan §9, open
question 1). Then:

- **Slugs:** `slug.de` = `post_name` of the DE post, `slug.en` = `post_name` of the EN partner. The slug checks and
  `-<legacyWpId>` fallback come from `lib/slugs.ts`. An EN post may have the same slug as its DE partner.
  That's fine, because slugs are unique per locale.
- **Pattern redirects** in `next.config`, next to the event ones:
  - `/neues/:slug` → `/de/news/:slug`
  - `/en/neues/:slug` → `/en/news/:slug`
- **Individual redirects** go into the shared `redirects.json` with `entity: 'post'`:
  - slugs changed by the extract;
  - `_wp_old_slug` values (6 published posts). Four of them are copies of one post ("Duplicate Post") that share the same
    old slugs; the redirect goes to the lowest id.
- **Yoast redirects** (`_yoast_post_redirect_info`) aren't used. They turned out to be unreliable: the meta sits on
  posts of every type, mostly for members and events; several have the origin `en`, which would send the whole English
  site to one post; and the only one for a published news post repeats its `_wp_old_slug`. Events don't use them either.
- The slug and redirect logic is shared with events: `assignSlugs` in `lib/slugs.ts`.
- **Testing:** as for events (03-events-plan §4.7), the anonymised dump only has `post-<n>` slugs. Locally the extract
  just uses them. Real slugs, duplicates and the individual redirects can only be checked in the staging rehearsal with
  the real dump.

---

## 5. Pipeline

Extends `wp:extract` / `wp:import` / `wp:verify` and `wp:sync`, following "Adding an entity" in the README:

- **Extract:** `scripts/extract/posts.ts` → `.data/wp-extract/posts.json`, plus its rows in `redirects.json`. Post-specific
  mapping (category union, tags) in `lib/post-mappers.ts` with unit tests. What events and posts share moved to `lib/`:
  `lib/wp-posts.ts` (which posts become documents, post content, old slugs, attachment lookup) and `assignSlugs` in
  `lib/slugs.ts`. The events extract gives byte-identical output after the move. `extract/categories.ts` adds the news terms.
- **Import:** `scripts/import/steps/posts.ts`, after `categories` (and alongside `events`). Same behaviour as events: the
  full run wipes imported posts (with a `legacyWpId`) and keeps posts staff wrote on the new site; `--only=posts` upserts by
  `legacyWpId`. German first, then the `en` locale.
- **Verify:** `scripts/verify/steps/posts.ts`: all extracted posts and no others, private ones `hidden`, dates and
  categories match, bodies present, EN title and slug exactly on the translated ones, a field-by-field sample of 20 DE and
  10 EN, and the number of image placeholders left.
- **Menu:** `NEEDS.posts = ['categories']` and a "News" group in `scripts/sync.ts`.
- **check-helpers.ts:** also reads news posts, so unknown `da_linked` values and unreadable `da_category`, `da_images`,
  `_thumbnail_id` and document ids fail there. Category mismatches are in the extract report.

Result on the anonymised dump: **453 news items**: 444 DE published + 4 private + 5 English-only; the 16 other EN posts
became the `en` locale of their DE partner. 21 have English (16 translated + 5 English-only), 4 are hidden, 2 not on the
homepage. 300 have categories (2 more categories than before, 134), 21 tags, 328 a badge, 2 an excerpt. 5 individual
redirects (all from `_wp_old_slug`). For the media step: 808 gallery IDs, 30 featured images, 92 inline image IDs
(placeholders in 9 texts) and 495 document IDs on 103 posts. The posts import takes about 5 s.

---

## 6. Media step (addition to 02-plan §11)

`media-manifest.json` gets `role = news-image | news-inline-image | news-document` with `owner = news:<legacyWpId>`.
That's ~830 images and ~500 documents for published news, on top of members and events. After the upload: `cover` =
`thumbnailWpId`, else the first image; `gallery` = the other images; `documents` from `documentWpIds`; placeholders in
`body` replaced by upload nodes. Documents go into the public `media`, since they're public today.

---

## 7. Build order

1. ✅ Schema: `src/collections/Posts.ts` with the model in §3, registered in `payload.config.ts`, and the migration
   `20261126_212331_posts` (only adds the posts tables).
2. ✅ `lib/post-mappers.ts` + unit tests; shared `lib/wp-posts.ts` and `assignSlugs`; iframes → links in `wp-html.ts`.
3. ✅ Categories extract extended to the posts' terms; `extract/posts.ts`; the `posts` import and verify steps; menu entry. On
   the anonymised dump and a local Postgres.
4. Frontend (not part of the migration, but needed before go-live):
   - ✅ List `/[locale]/news` (date and linked title, newest first, hidden left out) and detail page `/[locale]/news/[slug]`
     (cover, text, gallery, downloads; components `Posts` and `Post`), with the same slug lookup, EN redirect and hreflang as the event page. "Neues" /
     "News" in the menu.
   - Still to do: pagination and filters in the list (450 items), and homepage teasers that respect `visibility = notOnHome`.
5. At cutover: together with members and events, in the same run, + redirects.

Steps 1–3 don't depend on the open questions in §9.

---

## 8. Later / not now

- Yoast SEO titles and descriptions: only 3 published posts have their own, so not worth a field now. OG images (32) are
  the same as the featured image.
- Rewriting links to the old site inside bodies to the new paths (20 posts). The redirects cover them in the meantime.
- Links from news to events, members or publications: there's no structured field in WP, so it would be new work.
- The author (`legacy.authorWpId` keeps it) as a relation to `users`, if the new site wants bylines.

---

## 9. Open questions

1. **`DA` badge (321 posts).** What does it mean on the live site: "a designaustria post" as opposed to news about
   others? If it's that, a `source` select (`designaustria` / `external`) would be clearer than free text.
   *For now:* kept as free text, like the event badge.
2. **`Startseite` and `Jobs` categories.** Is `Startseite` still how posts get onto the homepage (then it should become
   `visibility` or a "featured" flag), and should jobs be their own content type?
   *For now:* both imported as normal categories, to revisit when the homepage and a job board are designed.
3. **URL structure** is the same site-wide question as 03-events-plan §9.1.
   *For now:* `/de/news/<de-slug>` and `/en/news/<en-slug>`, with pattern redirects from `/neues/` and `/en/neues/` (§4.6).
