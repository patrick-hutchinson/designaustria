# Migration plan: WordPress → Payload + Vendure (products, starting with publications)

Status: **steps 1–4 of §7 built** (shop setup and custom fields, `products` collection, mappers, extract/import/verify on
both sides, menu), and run on the anonymised dump with local databases; results in §5.4. Of the frontend (step 5), the
shop list and the product page are built; the media step (§6) and the cutover are still to do. Same approach as [03-events-plan.md](03-events-plan.md) and
[04-news-plan.md](04-news-plan.md), and it reuses that pipeline and its shared helpers in `lib/`. It's the first plan
that also writes to the **shop** (`designaustria-shop/`, Vendure 3.8), which has its own database. All numbers are from
the anonymised dump `2026-11-09_wordpress-database_export.sql`.

Payload gets a general **`products`** collection, not a `publications` one: publications are the first products, and
other items (templates, fonts, merchandise, …) are meant to follow. All products have the same fields. What makes one a
publication is its category (`Publikationen`) and a details block, not a type field (§3.1). Only publications are
migrated here.

Words used in this plan:

| Word | Means |
|---|---|
| **product** | a Payload `products` document: the page people see (text, images, details) |
| **shop product** | a Vendure Product with its ProductVariant: price, tax, stock, cart and checkout |
| **WC product** | a WooCommerce `product` post in WordPress |
| **publication** | a WordPress `publication` post. It becomes a product in the `Publikationen` category, with a `publicationDetails` block |

Legend: **Proposed** = default we'll build unless someone objects. **Decide** = needs input before building that part.

---

## 1. Scope

A publication isn't the same thing as a shop item. In WordPress they are two records:

- the **`publication`** post (CPT): title, subtitle, authors, ISBN, publisher, year, text, images, documents. This is
  the page people see (`/publikation/…`);
- an optional **WC product**, linked from the publication through ACF `da_product`. It has no text of its own (0 of 139
  have a body): it's just the price, tax, stock and download file behind the "add to cart" button.

139 of the 253 published publications have a WC product; the other 114 are only a page (84 of them with free documents).

So the split is:

| | Goes to | Why |
|---|---|---|
| The publication | Payload, new **`products`** collection | it's content, with DE/EN, members as authors, media, like events and news |
| The WC product behind it | Vendure, a **shop product** (one Product with one ProductVariant) | price, tax, stock, cart and checkout are the shop's job |

**In scope:** published and private publications, and the 138 WC products they link to.

**Out of scope here** ([07-shop-plan.md](07-shop-plan.md)): the 46 event WC products (tickets and registrations), the 55 standalone WC
products (contract templates, fonts, bundles, the one variable product), orders, customers, coupons and invoices. They
share the shop side of this pipeline (§5) once it exists; standalone ones that need a page become products too. The download permissions of past buyers of these publications are migrated with the orders too (§4.6). File
uploads are deferred to the media step, as everywhere (§6).

---

## 2. What's in WordPress

### 2.1 Publications

| | Count | Notes |
|---|---|---|
| Publications | 261 | 253 `publish`, 1 `private`, 7 `draft` |
| Language | 251 DE + 2 EN | 4 Polylang translation links, so almost nothing is translated |
| Published (`post_date`) | 2003–2026 | |
| Year (`da_publication_year`) | 237 | 1976–2026. 16 empty, one is `92` (logged, not guessed) |
| Body (`post_content`) | 237 | 212 Gutenberg. No excerpts |
| Subtitle (`da_publication_subtitle`) | 112 | |
| Authors, members (`da_publication_author`) | 105 publications | `post_object` list of `member` posts: 61 links to published members, **64 to `pending` ones** (not migrated, 02-plan §3.1) |
| Authors, external (`da_publication_author_ext`) | 60 | free text, e.g. "Stiftung Buchkunst". `da_publication_author_int` is a leftover (1) |
| ISBN (`da_publication_isbn`) | 110 | free text, some with stray characters (non-breaking spaces) |
| Publisher (`da_publication_publisher`) | 129 | free text, mostly "designaustria" |
| Pages (`da_publication_sites`) | 176 | number. `da_publication_scope` ("48 Seiten") is a leftover (1) |
| Format (`da_publication_style`) | 17 | free text: Hardcover, Softcover, Taschenbuch, dimensions … |
| Categories (`da_category`) | 230 | the shared `category` taxonomy, like news. 222 have **`Publikationen`** or one of its subcategories (Mitteilungen 56, Schriften österreichischer DesignerInnen 31, design\|er\|leben 30, Basisinformationen 27, Wettbewerbskataloge 19, …) |
| Images (`da_images`) | 252 | serialised attachment ids |
| Documents (`da_documents`) | 108 | ACF repeater, as for news |
| Members only (`da_members_access`) | 18 | checkbox `show` / `download`: 15 both, 3 only `download` |
| Visibility (`da_linked`) | 126 | 104 `all`, 22 `nostart`. Missing → `all` |
| Badge (`da_badge_name` / `_color`) | 0 / 13 | names all empty, so not migrated |
| WC product (`da_product`) | 139 | 138 distinct WC products: one is shared by two publications |
| `da_shop` | 2 | one points at a WC product (same as `da_product`), one at a missing post. Ignored, logged |

### 2.2 The 138 linked WC products

| | Count | Notes |
|---|---|---|
| Type | 138 `simple` | no variations |
| Title | 111 same as the publication | the other 27 differ only in `&shy;`, spelling or typos ("Grafikerinnern") |
| Regular price | 138 | €10 to €92.40 |
| Sale price ("Angebotspreis") | 41 set | ratio 0 (15), 0.5 (10), 0.56 (6), … Works as the **member price** (§4.4). No sale periods |
| Tax class | 93 `10`, 45 empty | both 10 % in WooCommerce's tax table (books, reduced rate) |
| Downloadable | 38 | 34 have `_downloadable_files` (in `woocommerce_uploads/`, not in the dump). Download limit mostly unlimited |
| Virtual | 1 | so everything else is shipped |
| Stock | 10 manage stock (`_stock`), 5 `outofstock` without managed stock | no backorders |
| Sold individually | 1 | |
| SKU | none | no `_sku` at all. 3 have `_global_unique_id` (an ISBN) |
| Images | 26 `_thumbnail_id`, 5 gallery | the publication's `da_images` are what the site shows |
| Weight / dimensions | none | |
| Product categories | `130` (41) / `Uncategorized` (3) | not meaningful, not migrated |
| `woo_expiry_date` | 84 keys, all empty | only used on event WC products |
| Sales | 522 completed order lines 2021–2026 | 76 of the 138 sold at least once |

---

## 3. Target

### 3.1 Payload: `products` collection (Proposed)

Every product has the same fields; there's no `type`. Differences between kinds of product come from two places:

- **Categories** say what it is. Publications are in `Publikationen` (§4.1), so a publications list or feed is the
  products in that category, and its subcategories (Mitteilungen, Wettbewerbskataloge, …) work as series.
- **Blocks** in `details` hold what only some products have. Publications get a `publicationDetails` block; a font or a
  template later gets its own block, without new columns on every product.

The shared fields follow `Posts.ts` / `Events.ts`. Admin labels "Produkte" / "Products".

| Field | Type | From WP | Notes |
|---|---|---|---|
| `title` | text, localized, required | `post_title` (+ EN partner) | keeps `&shy;` as U+00AD, which the frontend hyphenates |
| `subtitle` | text, localized | `da_publication_subtitle` | |
| `slug` | text, localized, unique per locale | `post_name` (§4.5) | |
| `categories` | relationship → `categories`, hasMany | `da_category`, plus `Publikationen` where missing (§4.1) | via `extract/categories.ts`, as for news |
| `cover`, `gallery` | `mediaField()` | `da_images` (first = cover) | media step |
| `documents` | upload → `media`, hasMany | `da_documents[]` | media step |
| `membersOnly` | group: `content` (checkbox), `documents` (checkbox) | `da_members_access` `show` → `content`, `download` → `documents` | §4.3 |
| `body` | rich text, localized | `post_content` → Lexical | `lib/wp-html.ts` + `lib/html-to-lexical.ts` |
| `details` | blocks | `publicationDetails` (below) | rendered as a facts list next to the price |
| `visibility` | select `everywhere` / `notOnHome` / `hidden` | `da_linked`; private → `hidden` | as events and news |
| `publishedAt` | date | `post_date` (Vienna → UTC) | sort order of the list |
| `shopSku` | text, indexed | `WP-<WC product id>` (§3.3) | empty = not for sale |
| `legacyWpId` | number, unique | publication id | WordPress post ids are unique across post types, so later products can use their own post's id |
| `legacy` | group, read-only: `wpPostType`, `enWpId`, `wcProductWpId`, `imageWpIds[]`, `inlineImageWpIds[]`, `documentWpIds[]`, `memberAuthorWpIds[]`, `wpStatus` | | for the media step and checking |

**`publicationDetails` block** (one per publication, only added when one of its fields has a value):

| Field | Type | From WP | Notes |
|---|---|---|---|
| `authors` | relationship → `members`, hasMany | `da_publication_author` | only migrated (published) members, §4.2. Member profiles can list their publications by querying `details.authors` |
| `authorsText` | text | `da_publication_author_ext` + names of unmigrated member authors | shown after the linked authors |
| `year` | number | `da_publication_year` | only 4-digit years; others logged and left empty |
| `publisher` | text | `da_publication_publisher` | |
| `isbn` | text | `da_publication_isbn` | trimmed, spaces normalised |
| `pages` | number | `da_publication_sites` | |
| `format` | text | `da_publication_style` | |

Access as for news: anyone may read, only staff may write.

### 3.2 Vendure: shop product (Proposed)

One Product with one Variant per WC product. New **custom fields** in `designaustria-shop/src/vendure-config.ts`
(and a Vendure migration, `npx vendure migrate`):

| Entity | Custom field | Type | From WP |
|---|---|---|---|
| Product | `legacyWpId` | int, unique, read-only in the dashboard | WC product id |
| Variant | `memberPrice` | int (cents), nullable | `_sale_price` (§4.4) |
| Variant | `legacyDownloadFiles` | text (JSON), read-only | `_downloadable_files` names and paths, for the media step |

Mapping onto Vendure's own fields:

| Vendure | From WP | Notes |
|---|---|---|
| Product `name` (de) | the publication title, `&shy;` removed | what customers see in the cart, emails and invoices. The 27 WC product titles that differ are logged |
| Product `slug` | the publication slug | Vendure makes it unique |
| Product `description` | empty | the text lives in Payload |
| Product `enabled` | WC product `publish` → true | |
| Variant `sku` | `WP-<WC product id>` | §3.3 |
| Variant `price` | `_regular_price` × 100 | integer cents, **incl. VAT**: the channel has `pricesIncludeTax = true` |
| Variant `taxCategory` | `_tax_class` `10` and empty → "Ermäßigt 10 %" | WooCommerce's tax table has 10 % for the empty (default) class too, so all 138 are 10 %. The tax categories are shop setup (07-shop-plan §3) |
| Variant `trackInventory` / `stockOnHand` | `_manage_stock` + `_stock` | `outofstock` without managed stock (5) → track, 0 on hand: shown as sold out ("vergriffen"), staff can restock in Vendure |
| Product `featuredAsset` | (later) the product's cover | the shop dashboard only; the site shows Payload's images |

Translations: German only. The 2 EN publications get an `en` name too.

### 3.3 The link between the two (Proposed)

Both sides derive the same key from WordPress: **SKU `WP-<WC product id>`**. Payload stores it in `products.shopSku`;
Vendure has it on the variant. The product page asks the Shop API for the variant by SKU (price, member price, stock)
and adds it to the cart with its id.

So neither import needs the other's database ids, and they can run in either order or alone. The SKU stays stable
across reimports. Staff can give new shop products any SKU later; they just put it on the product too. The shared WC
product (2 publications → 1 WC product) simply gives both products the same SKU.

---

## 4. Transformation rules

### 4.1 What's migrated

- Publications: `publish` (253) and `private` (1, → `hidden`, no redirect). Drafts aren't migrated.
- Every migrated publication is in the `Publikationen` category: the 22 that aren't (24 published posts, 23 of them with
  no category at all, minus 2 English partners) get it added, logged as `product.category-added`. That keeps "all publications" a plain category filter.
- WC products: every one linked from a migrated publication (138). Status `publish` → enabled. WC products linked only
  from drafts or nothing are out of scope here (§1).

### 4.2 Authors

- `da_publication_author` ids are mapped to `members` through `legacyWpId`. 61 links point to published members.
- The **64 links to pending members** have no Payload record. Their name (`da_member_firstname` / `_lastname`, or the post
  title) is added to `authorsText` in the `publicationDetails` block, so nobody disappears from the page. Logged as `product.author-not-migrated`.
- Order is kept: linked members first, then `authorsText`. (Mixed order isn't recoverable from WP.)

### 4.3 Members-only

`da_members_access` ("Nur Mitglieder") is a checkbox with two values. WordPress calls them `show` and `download`; the new
names say what they restrict:

| WP | Payload | Meaning | Publications |
|---|---|---|---|
| `show` | `membersOnly.content = true` | only logged-in members see the full page: text, gallery and documents. Everyone else sees the title, subtitle, cover and authors, with a login prompt. It stays in the list | 15 |
| `download` | `membersOnly.documents = true` | the documents are only for logged-in members; on its own (3 publications), the rest of the page stays public | 18 (15 together with `show`) |

The meaning of `show` is an assumption (§9.1). The frontend enforces both once member login on the site exists.

### 4.4 Prices and member price

- `_regular_price` → variant price. `_price` (the active price) isn't used: it's `_sale_price` when that's set.
- `_sale_price` → `memberPrice`, **not** Vendure's price. WooCommerce calls it "Angebotspreis", but the theme applies it
  only to members: on these WC products, buyers logged in with a member profile paid it in 243 of 248 order lines, and
  guests paid the regular price in 128 of 136. Only one WC product (not a publication's) ever had a sale period
  (`_sale_price_dates_*`), so there's nothing time-based to migrate.
- Who gets it on the new shop: **every customer linked to a member profile** (the few full-price member orders are
  treated as exceptions, e.g. ordered before logging in). That needs a small Vendure plugin: a
  `ProductVariantPriceCalculationStrategy` that uses `memberPrice` for customers in a "Mitglieder" customer group, kept
  in sync with the member profiles in Payload. The plugin isn't part of the migration; until it exists, everybody pays
  the regular price on the new shop.
- `memberPrice = 0` on 15 WC products (mostly the downloadable ones) means "free for members", which ties in with
  `membersOnly.documents` on the product.

### 4.5 Languages, dates, slugs and redirects

As news (04-news-plan §4.2–4.6), with the shared helpers:

- DE publication is the document, EN partner → `en` locale. English-only → copied to `de`, logged.
- `post_date` Vienna → UTC with `viennaToUtc`.
- URLs: one route for all products, since there's no type to split them by: `/publikation/:slug` →
  `/de/products/:slug`, `/en/publikation/:slug` → `/en/products/:slug` (pattern redirects in `next.config`; URL shape per
  the open question §9.2). A publications overview is a page or route listing the `Publikationen` category.
  Changed slugs and `_wp_old_slug` → `redirects.json` with `entity: 'product'`.
- Old WC product URLs (`/produkt/:slug`) redirect to the product page. That's a list (WC product slug → product), also
  `entity: 'product'` in `redirects.json`. The 5 WC product `_wp_old_slug` values are included.

### 4.6 Downloadable WC products

38 are downloadable (PDF editions, contract templates), and they **keep being sold, including to past buyers**. Vendure
has no digital fulfilment built in, so:

- This step gives the variant `legacyDownloadFiles` (JSON: the files and `_download_limit`) and no shipping. 20
  `_downloadable_files` values have wrong PHP string lengths (the URLs were changed without updating them); they're read
  by pattern and logged as `shop-product.download-files-repaired`, so the media step should check those paths.
- A digital-products plugin in the shop (07-shop-plan §10) delivers the file after payment, from private storage,
  with WooCommerce's limits (`_download_limit`, mostly unlimited; `_download_expiry`, always unlimited).
- Past buyers' download rights (`wp_woocommerce_downloadable_product_permissions`, 459 rows, with download counts) are
  migrated with the orders, so they can download again on the new site. They need the customers and orders in Vendure
  first, so they're in 07-shop-plan §7, not here.

---

## 5. Pipeline

### 5.1 Where things run

| Part | Lives in | Database | Env |
|---|---|---|---|
| Extract (MySQL → JSON) | `designaustria-app/migration/wordpress/scripts/extract/` (as now) | WP MySQL | — |
| Payload import/verify `products` | `designaustria-app/migration/wordpress/scripts/{import,verify}/steps/` (as now) | app Postgres | `designaustria-app/.env.local` |
| Vendure import/verify `shop-products` | `designaustria-shop/migration/wordpress/` | **shop** Postgres | **`designaustria-shop/.env.local`** |
| Menu | `designaustria-app/migration/wordpress/scripts/sync.ts` | both | asks per database |

The Vendure part has to live in the shop package: it boots Vendure in-process (`bootstrapWorker(config)` and the
`ProductService` / `ProductVariantService` with a superadmin `RequestContext`), like the Payload Local API on the app
side, and `@vendure/core` only resolves from the shop's `node_modules`. It's a thin layer: the shared pure helpers
(`Report`, the step and check types, `extract-types.ts`) are imported from the app's `migration/wordpress/lib/` by
relative path, and it reads the same `designaustria-app/.data/wp-extract/`. The plan and docs stay here.

Why in-process and not the Admin GraphQL API: no running server needed, the whole import is one transaction (wipe +
create, like `wipe.ts`), and the safety guard can check the database URL directly. Search index jobs that the product
service queues are processed by the worker it started.

### 5.2 The shop's `.env.local`

- `vendure-config.ts` loads only `.env` today (`import "dotenv/config"`). Change it to load `.env.local` first, then `.env`
  (`dotenv.config({ path: ['.env.local', '.env'] })`), so `npm run dev` and the migration scripts use the same file.
  `.env.*` is already gitignored. `.env.example` gets a note.
- `.env.local` holds the shop's Neon dev branch (`designaustria-shop-database`, direct connection), which is a different
  host than the app's Neon DB.
- Unlike the app's dev DB, the shop's dev DB is **migrated**, not pushed: `synchronize: false` and `runMigrations()` on
  every start. So the shop's `lib-env` checks for pending Vendure migrations and stops (no "dev push" exception).
- The same guard as the app: refuse a non-local `DATABASE_URL` unless `--allow-remote`. For local work a Postgres in the
  app's `docker-compose.yml` (`shop-db`, `127.0.0.1:5434`), so nothing touches Neon by accident.

### 5.3 Steps

- **Extract:** `scripts/extract/products.ts` → `products.json` (Payload products, from publications), and
  `scripts/extract/shop-products.ts` → `shop-products.json` (only WC products linked from migrated publications for
  now). Mapping in `lib/product-mappers.ts` (shared fields, the `publicationDetails` block) and
  `lib/shop-product-mappers.ts` (prices to cents, tax class, stock, SKU), with unit tests. `extract/categories.ts` adds
  the products' terms. Redirect rows for both.
- **Payload import:** `steps/products.ts` after `categories` and `members`. Wipe and `--only` upsert as for news.
- **Shop seed:** `designaustria-shop/migration/wordpress/seed.ts`, idempotent: languages, the default channel (German,
  EUR, prices incl. VAT), country AT and zone "Österreich", the four tax categories and rates of 07-shop-plan §3, and the
  "Mitglieder" customer group. Shipping methods come with 07-shop-plan.
- **Vendure import:** `designaustria-shop/migration/wordpress/import.ts` (step `shop-products`), in one transaction. It
  upserts by `legacyWpId`, so imported products keep their ids across reruns (Vendure only soft-deletes, and order lines
  point at variants). A full run also soft-deletes imported shop products that aren't in the extract any more (and clears
  their `legacyWpId`), so the result is the same as wipe + create; `--only=shop-products` doesn't remove anything.
  Staff-made ones (no `legacyWpId`) are never touched. Precondition check: the channel, the tax categories and the
  languages exist, else it stops with what's missing (a dry run only warns, since the menu dry-runs it before the seed).
  Afterwards it processes the search index jobs it queued (about a minute).
- **Verify (Payload):** all extracted products and no others, all in `Publikationen`, the `publicationDetails` block
  (authors, `authorsText`), SKUs, private ones hidden, sample field-by-field.
- **Verify (Vendure):** all extracted shop products and no others, price, member price, tax category and stock per SKU,
  and **every `shopSku` in `products.json` has a variant** (the cross-check between the two sides, from the extract, so
  it doesn't need both databases at once).
- **Menu:** `NEEDS.products = ['categories', 'members']` and a "Products" group for the Payload step. The shop is its own
  system in the menu (Website, Shop or Both), since neither side needs the other: it asks for the shop database
  (`designaustria-shop/.env.local`, pasted URL, local Docker) and runs the shop scripts with `cwd: designaustria-shop`:
  seed and import as dry runs, confirm, seed, import, verify. After a website-only products import it reminds you of the
  shop.
- **check-helpers.ts:** reads publications and their WC products, so unreadable `da_publication_author`, `da_product` or
  unknown `_tax_class` / `_stock_status` values fail there.

### 5.4 Result on the anonymised dump

**252 products**: 251 published + 1 private (hidden) publications; the 2 English posts became the `en` locale of their
German partner, none is English-only. 22 not on the homepage. All are in Publikationen (22 added); 17 more categories than
before (151, mostly the Publikationen subcategories). 236 have a text, 244 a `publicationDetails` block: 61 links to 51
members, 122 `authorsText` (64 names of unmigrated member authors in it, 2 author ids point at deleted posts), 236 years
(`92` left empty), 109 ISBN/ISSN, 175 page counts. Members only: 14 full page, 17 documents. For the media step: 362
image ids on 251 products, 96 document ids, no inline images.

**139 products for sale** (one WC product is shared by two), **138 shop products**: all 10 %, 43 with a member price (15
of them 0), 14 with tracked stock (9 in stock, 5 sold out), 38 downloadable (34 with a file, 19 of those repaired), 2 with
an English name. 20 WC titles really differ from the publication's (`shop-product.title-differs`, the product title is
used). 154 product redirects: 143 from old WC product URLs (`/produkt/…`, with 5 old WC slugs) and 11 `_wp_old_slug`.

The extract now also turns `&shy;` into U+00AD everywhere (13 events and 1 post changed). The Payload step takes
about 2 s, the shop import 4 s plus about a minute for the search index.

---

## 6. Media step (addition to 02-plan §11)

`media-manifest.json` gets `role = product-image | product-document` (`owner = product:<legacyWpId>`), and
`role = shop-product-download` for the 34 `_downloadable_files` (from `woocommerce_uploads/`, which must stay private:
they're paid files). After upload: `cover` / `gallery` / `documents` in Payload, and the cover as Vendure
`featuredAsset` through the AssetServerPlugin.

---

## 7. Build order

1. Shop: `.env.local` loading, custom fields + Vendure migration, tax categories and channel setup (a seed script, so
   local, dev and production match).
2. Payload: `src/collections/Products.ts` + migration.
3. `lib/product-mappers.ts`, `lib/shop-product-mappers.ts` + unit tests; extract for both.
4. Payload import/verify step `products`; shop import/verify scripts (`shop-products`); menu group. On the anonymised
   dump, local Postgres for both.
5. Frontend (needed before go-live, not part of the migration): product detail page (with the `publicationDetails`
   block and the price and "in den Warenkorb" from the Shop API by SKU), and a publications list (products in
   `Publikationen`). *Built:* `/[locale]/products` lists all products from Payload, like the members, events and news
   lists, and `/[locale]/products/[slug]` is the Payload product with price, member price and cart from the Shop API (the SKU is
   found through its search index). The cart is at `/[locale]/cart`, with its link in the header. Still to do: the category filter (publications, series) and `membersOnly`, which
   needs member login on the site.
6. At cutover: together with the rest, + redirects. Shop products after go-live are edited in Vendure, so as with
   Payload the shop import **must not run on production again** after go-live.

Steps 1–4 don't depend on the open questions.

---

## 8. Later / not now

- Other products (templates, fonts, …) from the standalone WC products, with their own details blocks where needed, the event WC products, orders, customers,
  coupons, download permissions and invoices (07-shop-plan).
- Member price in checkout (the Vendure plugin and the "Mitglieder" customer group, §4.4) and digital delivery (§4.6).
- Reviews (none) and WC product categories (`130`, `Uncategorized`: not meaningful).

---

## 9. Open questions

1. **Members only (`show`).** Does `show` hide the whole publication from non-members, or only some of it? 15 publications.
   *For now:* assumed to mean only logged-in members see the full page (`membersOnly.content`, §4.3); non-members see the
   title, subtitle, cover and authors.
2. **URL structure** is the same site-wide question as 03-events-plan §9.1.
   *For now:* `/de/products/<slug>` and `/en/products/<slug>` for every product (§4.5), the list at `/de/products`, the
   cart at `/de/cart`. The menu still says "Shop".
