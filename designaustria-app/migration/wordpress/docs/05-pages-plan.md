# Migration plan: WordPress → Payload (pages)

Status: **plan only**, nothing built yet. Same approach as [03-events-plan.md](03-events-plan.md) and
[04-news-plan.md](04-news-plan.md), and it reuses that pipeline and its shared helpers in `lib/` (slugs and redirects,
Polylang, DE/EN document picking, WordPress HTML → Lexical). All numbers are from the anonymised dump
`2026-11-09_wordpress-database_export.sql`.

There is no pages collection in Payload yet (only a placeholder `/about` route), so this adds a new **`pages`**
collection, a set of layout blocks and a catch-all frontend route.

Legend: **Proposed** = default we'll build unless someone objects. **Decide** = needs input before building that part.

---

## 1. Scope

**In scope:** the 98 content pages (§2.1): their blocks, DE/EN translations, hierarchy and redirects.

**Not migrated:**
- The 20 pages that are really app features (§2.1). They become routes in code; most already exist (`/events`,
  `/members`, `/shop`). Their short intro texts are dropped.
- The 4 homepages. The new homepage is built on the new site, not imported (§2.1).
- Sidebars (§2.4).
- Deferred, as for members, events and news: image files. Pages are imported with their WordPress attachment ids, and
  the media step attaches the files later (§6).

---

## 2. What's in WordPress

| | Count | Notes |
|---|---|---|
| Pages | 127 | 121 `publish`, 1 `private`, 3 `draft`, 2 `pending`. Only published and private are considered |
| Templates | none | `_wp_page_template` is empty on every page: all pages are built from Gutenberg blocks |
| Language | 74 DE + 48 EN | 46 Polylang translation groups |
| Hierarchy | 2 levels | Top-level pages with children: Über designaustria (7), ExpertsCluster (18), Service (13), Wettbewerbe (4), Partner (1), and their EN versions |
| Menus | 4 nav menus, 24 items | Hauptmenü DE/EN, Kontaktmenü DE/EN. Only pages and one custom link (shop) |
| Slug | | Real on the live site (`/expertscluster/designforschung/`), **anonymised to `post-<n>`** in the dump, as for news. No `_wp_old_slug` on pages |

### 2.1 Which pages

| Group | Pages | Migrated |
|---|---|---|
| **Content** | 98 (56 DE, 42 EN; 41 pairs): Über designaustria and sub-pages, ExpertsCluster and the clusters, Service and sub-pages, Wettbewerbe and the awards, Partner, Kontakt, FAQ, Presse, Impressum, Datenschutz, AGB Webshop, designforum, and the EN versions | **Yes** |
| **App features** | 20: Warenkorb, Kassa (`[woocommerce_cart/checkout]`), Shop, Programm/Program, Mitglieder/Members (lists with an intro), 10 "Mitglied …" member-area pages (`acf/memberform`, `[woocommerce_my_account]`, the codes page), Admin (empty), Jobbörse (stub), HowTos Intern (private) | No: routes in code |
| **Homepages** | 4: Home DE/EN (36500/36633, 2026 content) and an older pair (202/15400, 2024). Grids of hand-picked teasers | No |

The excluded ids are listed in the extract (`EXCLUDED_PAGE_IDS`) with the reason, so a new dump with new pages fails
loudly instead of importing them silently.

### 2.2 Blocks on the 98 content pages

Core blocks:

| Block | Count | Notes |
|---|---|---|
| `paragraph` / `heading` / `list` | 518 / 145 / 9 | 96 pages start with a heading, usually the page title (55 as H1) |
| `image` | 94 on 26 pages | 21 link to the full image (lightbox), a few to partner sites |
| `columns` / `column` | 82 / 247 | Mostly layout. **120 columns have an `href`** (a linked-block plugin): these are cards (§2.3) |
| `buttons` / `button` | 12 / 13 | Links styled as buttons (`is-style-outline`, `is-style-fill`) |
| `group` | 7 | 6 with `is-style-infobox` (a highlighted box) |
| `spacer` | 22 | Layout only |
| `html` | 71 | 58 inline `<svg>` icons with a caption (inside cards), 8 `<details>` (all on FAQ), 2 Google Maps iframes, 1 Issuu embed, 2 others |
| `shortcode` | 1 | `[modula id=…]` gallery on designforum |

ACF blocks (the site's own):

| Block | Count | What it does | Settings used |
|---|---|---|---|
| `acf/members` | 40 | List of members as icons | `status` = `team` / `board`, and/or `categories`. Every ExpertsCluster page shows the members in its category |
| `acf/post` | 20 | One hand-picked teaser with an optional label and title | 18 members (team on Kontakt, board on Verein), 2 publications (Corporate Design DE/EN) |
| `acf/posts` | 7 | A feed of news, events or publications | `type` (missing = news, the field's default), `categories` |
| `acf/communities` | 4 | Organisations by status | `partner`, `education` (Partner DE/EN) |
| `acf/calculator` / `acf/rate` | 3 / 1 | Fee calculator, hourly-rate calculator | none |
| `acf/product` | 3 | Shop product teaser | product id |

No reusable blocks (`wp:block`) and no patterns are used.

### 2.3 Cards

The main layout pattern: a row of `columns`, each `column` with an `href`, holding an image or an inline SVG icon and
a caption. 84 link inside the site, 36 outside. Used on the ExpertsCluster, About and Service overviews (SVG icons,
about 21 distinct), the partner logo walls and the award overviews (images). `opensInNewTab` is set on 30.

### 2.4 Page fields

| Field | Pages | Notes |
|---|---|---|
| `da_sidebar` / `da_sidebar_object` | ~100 | Points to one of 24 `sidebar` posts: newsletter form, service links, list filters, "become a member", mostly raw HTML. **Not migrated** (§1). The id goes into `legacy.sidebarWpId` for reference |
| `da_category` | 16 | The category of each ExpertsCluster page (+ the homepages) |
| `da_members_only` | 6 | Service DE/EN and the Honorarrechner pages: members only |
| `da_members_access` / `da_members_view` | member-area pages, Service | All on excluded pages except Service, which also has `da_members_only` |
| `_thumbnail_id` | 5 | The award pages |
| Theme colours (`da_main_color`, `da_bg_color`, …), logo switches, `da_linked`, `da_badge_name` | | Presentation, or always `all` / empty. Ignored |
| Yoast | 2 have a description | Ignored, as for news (§8) |

---

## 3. Target: a new `pages` collection

### 3.1 Fields (Proposed)

| Field | Type | From WP | Notes |
|---|---|---|---|
| `title` | text, localized, required | `post_title` (+ EN partner) | |
| `slug` | text, localized, indexed | DE / EN slug (§4.5) | unique per locale **and parent** |
| `parent` | relationship → `pages` | `post_parent` | for the nested URL; the EN partner's parent must be the partner of the DE parent (checked, §4.2) |
| `path` | text, localized, indexed, read-only | | `/<parent slug>/<slug>`, kept up to date by a hook; the route looks pages up by it |
| `layout` | blocks, **localized** | `post_content` → blocks (§3.2, §4.3) | each language has its own list of sections, since DE and EN pages are sometimes built differently |
| `category` | relationship → `categories` | `da_category` | ExpertsCluster pages |
| `cover` | `mediaField()` | `_thumbnail_id` | filled in the media step |
| `membersOnly` | checkbox | `da_members_only` | the frontend shows a login prompt instead of the layout |
| `legacyWpId` | number, unique | DE page id | `legacyWpIdField` |
| `legacy` | group, read-only: `enWpId`, `sidebarWpId`, `thumbnailWpId`, `wpStatus` | | |

Admin: `useAsTitle: 'title'`, columns `title`, `path`, `updatedAt`. Access as for news: anyone may read (the
members-only check is in the frontend, like the rest of the member area), only staff may write. Live preview later.

### 3.2 Blocks (Proposed)

In `src/blocks/`, one file per block, each registered in the `layout` field. Shared by later content types if needed.

| Block | Fields | From WP |
|---|---|---|
| `content` | `body` (rich text), `style` select `default` / `infobox` | runs of core blocks (paragraph, heading, list, image, button, flattened columns); `group.is-style-infobox` → `style = infobox` |
| `cards` | `items[]`: `image` (media), `title`, `link` (internal page or URL), `newTab`; `legacy.imageWpIds` | linked columns (§2.3) |
| `accordion` | `items[]`: `title`, `body` (rich text) | `<details><summary>` |
| `embed` | `url`, `title` | map iframes, Issuu |
| `memberList` | `functions` (select hasMany: `staff`, `board`), `categories` → `categories`, `members` → `members` hasMany (hand-picked) | `acf/members`; consecutive `acf/post` member teasers become one `memberList` with `members` |
| `organizationList` | `partnerStatus` (select: `partner`, `premium`, `education`) | `acf/communities` |
| `feed` | `type` (`posts` / `events` / `products`), `categories`, `limit` | `acf/posts` |
| `featured` | `item` (polymorphic: `posts`, `events`, `products`), `label`, `title` | `acf/post` publication teasers (§4.3) |
| `tool` | `tool` (select: `feeCalculator`, `hourlyRateCalculator`) | `acf/calculator`, `acf/rate`. Renders a React component; the calculators are rebuilt separately |

The member filters map onto fields that are already migrated: `team` → `functions` includes `staff`, `board` →
`functions` includes `board` (02-plan §3.2), `partner` / `education` → `partnerStatus`.

---

## 4. Transformation rules

### 4.1 Which pages

- `publish` pages, minus the 24 excluded ones (§2.1). The one `private` page (HowTos Intern) is excluded too.
- `draft` and `pending` pages aren't migrated.

### 4.2 Languages (Proposed)

Same rules as events and news, with one difference: the EN `layout` is converted from the EN page's own content
rather than shared, because the layout is localized.

- The DE page is the document; its EN partner becomes the `en` locale: `title`, `slug`, `layout`. Its own category,
  cover and members-only flag are ignored, and differences are logged.
- 1 EN page has no DE partner (25500 "ABO form"): the EN page is the document, its content is copied to `de` too, and
  `legacyWpId` is the EN page id. Logged.
- 15 DE pages have no EN partner: the `en` locale stays empty and falls back to DE.
- Pairs whose parents aren't a pair (e.g. 25505 "ABO page" is the partner of 25162 "ABO Grafikmagazin") are logged;
  the DE parent is used.

### 4.3 Blocks → `layout`

A new `lib/gutenberg.ts` parses `post_content` into a block tree (the block comments with their JSON attributes, and
the HTML between them). `cleanWpHtml` only strips the comments, which isn't enough here. Then
`lib/page-blocks.ts` walks the top level:

- **Core blocks** are collected into runs; each run becomes one `content` block, its HTML cleaned with `cleanWpHtml`
  (images → `[[wp-image:<id>]]` placeholders, buttons → links, columns flattened) and converted to Lexical at import.
  A `group.is-style-infobox` starts its own `content` block with `style = infobox`.
- **The leading heading** (96 pages) is dropped when its text matches the page title, as the page template prints the
  title. Otherwise it stays, and it's logged.
- **`columns` whose columns have an `href`** become a `cards` block. Consecutive rows of cards are merged into one
  block. Each item: the image id, or the inline SVG (§6); the caption as `title`; the link (§4.6) and `opensInNewTab`.
- **`html`**: `<details>` → `accordion` (consecutive ones merged); an iframe or the Issuu embed → `embed`; SVGs
  only appear inside cards. Anything else is dropped and logged.
- **ACF blocks**: as in §3.2. Category, member and organisation ids stay WordPress ids in the extract and are
  resolved by `legacyWpId` at import, as for event and news categories. A missing target (e.g. an unpublished member)
  is dropped and logged.
- **Publications** become documents in the Payload `products` collection, all in the `Publikationen` category
  ([06-products-plan.md](06-products-plan.md)); only their price and stock are in Vendure. The 2 publication teasers
  become `featured` with `item` → that product, resolved by `legacyWpId` (the publication id), and the 2 publication
  feeds become `feed` with `type = products` and their categories (`Publikationen` or a subcategory).
  So the products import runs before pages.
- **`acf/product`** (3), **`spacer`**, the **`[modula]`** gallery and unknown blocks are dropped and logged. The
  product pages also link to the product in the text.
- Adjacent `content` blocks are merged, and empty ones removed.

### 4.4 Members only

`da_members_only` = `members` → `membersOnly = true` (6 pages). That's Service DE/EN, a whole section's overview.
Whether its sub-pages should be members only too is §9.1.

### 4.5 Slugs, URLs and redirects

| | Live site | New site |
|---|---|---|
| DE | `/expertscluster/designforschung/` | `/de/expertscluster/designforschung` |
| EN | `/en/expertscluster/design-research/` | `/en/expertscluster/design-research` |

The URL keeps the WordPress hierarchy, under the same site-wide interim decision as `/news` and `/events`
(03-events-plan §9, open question 1).

- **Slugs:** `slug.de` = `post_name` of the DE page, `slug.en` = `post_name` of the EN partner, made unique per
  parent with `assignSlugs` from `lib/slugs.ts` (it currently checks uniqueness across the collection; it gets a
  scope key).
- **Clashes with app routes:** a page slug at the top level can't be `events`, `news`, `members`, `member`, `shop`.
  The extract checks this and appends `-<legacyWpId>`, with a redirect.
- **Redirects:** one catch-all pattern in `next.config`, after the event and news patterns: `/<path>/` →
  `/de/<path>` for paths no other rule matches (`/en/…` paths only lose the trailing slash). Individual redirects in
  `redirects.json` (`entity: 'page'`) only where the path changes beyond that: a slug made unique, or an app-route clash.
- **Testing:** as for news, real slugs and clashes can only be checked in the staging rehearsal with the real dump.

### 4.6 Links inside pages

The card links and links in the text point at the live site (`https://www.designaustria.at/expertscluster/…`,
`/service/support`, partly JSON-escaped). For cards, an internal link to a migrated page becomes a relation to that
page, so it survives slug changes; any other internal link is kept as a path and covered by the redirects. Links in
rich text are left as they are, as for news (§8).

---

## 5. Pipeline

Extends `wp:extract` / `wp:import` / `wp:verify` and `wp:sync`, following "Adding an entity" in the README:

- **Extract:** `scripts/extract/pages.ts` → `.data/wp-extract/pages.json` (in parent-first order) plus its rows in
  `redirects.json`. Shared parsing in `lib/gutenberg.ts`, page mapping in `lib/page-blocks.ts`, both with unit tests
  on real block snippets from the dump.
- **Import:** `scripts/import/steps/pages.ts`, after `categories`, `members`, `organizations`, `events`, `posts` and `products`
  (`featured` and `memberList` point at them). Pages are created parent first, German first, then the `en` locale.
  Same wipe/upsert behaviour as news: the full run wipes imported pages (with a `legacyWpId`) and keeps pages staff
  made on the new site; `--only=pages` upserts by `legacyWpId`.
- **Verify:** `scripts/verify/steps/pages.ts`: all extracted pages and no others, parents and paths match, block types
  and counts per page and locale match the extract, all references resolved, members-only flags, and the number of
  image placeholders left.
- **Menu:** `NEEDS.pages = ['categories', 'members', 'organizations', 'events', 'posts', 'products']` and a "Pages" group in
  `scripts/sync.ts`.
- **check-helpers.ts:** parses every published page, and fails on a block the mapper doesn't know (so a new block
  type in a new dump is caught before extracting).

---

## 6. Media step (addition to 02-plan §11)

`media-manifest.json` gets `role = page-image | page-inline-image | page-card-image | page-icon` with
`owner = page:<legacyWpId>`:
- the 94 inline images and the card images (by attachment id), and the 5 covers;
- the inline SVG icons (58 in cards, about 21 distinct): the extract writes each distinct one to `.data/wp-extract/page-icons/<hash>.svg`, and
  the media step uploads them like any other file. Their CSS classes (`main`, `side`, `link`, …) take colours from
  the WordPress theme, so the extract inlines the default colours before writing them.

After the upload: placeholders in `content` replaced by upload nodes, `cards.items.image` and `cover` set.

---

## 7. Build order

1. Schema: `src/collections/Pages.ts` and the blocks in `src/blocks/`, registered in `payload.config.ts`, plus the
   migration (only adds the pages tables).
2. `lib/gutenberg.ts`, `lib/page-blocks.ts` + unit tests; `assignSlugs` with a scope key.
3. `extract/pages.ts`; the `pages` import and verify steps; menu entry; `check-helpers.ts`. On the anonymised dump and
   a local Postgres.
4. Frontend (not part of the migration, but needed before go-live):
   - catch-all route `/[locale]/[...path]` with the same EN redirect and hreflang as the news page, replacing the
     `/about` placeholder;
   - a `Blocks` renderer with a component per block. `feed` and `featured` reuse the `Events` / `Posts` components;
   - the menu from the WP nav menus (hard-coded for now, like the current `Menu`);
   - the calculators for the `tool` block (separate task).
5. At cutover: together with the other entities, in the same run, + redirects.

Steps 1–3 don't depend on the open questions in §9.

---

## 8. Later / not now

- Yoast descriptions (2 pages).
- Rewriting links to the old site inside page text to the new paths. The redirects cover them in the meantime.
- The nav menus as a Payload global, so staff can edit the menu.
- A sidebar per section, if the new design has one.

---

## 9. Open questions

1. **Members only.** Only the Service overview (and the Honorarrechner pages) are flagged, not the Service sub-pages
   (discounts, consulting, …). Was that intended on the live site, or did the theme protect the whole section?
2. **URL structure** is the same site-wide question as 03-events-plan §9.1.
   *For now:* the WordPress hierarchy under `/de/` and `/en/` (§4.5).
