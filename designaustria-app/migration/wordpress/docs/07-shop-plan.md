# Migration plan: WordPress → Vendure (shop)

Status: **plan only**, nothing built yet. Continues [06-products-plan.md](06-products-plan.md), which sets up the shop
side of the pipeline (`designaustria-shop/migration/wordpress/`, the shop's `.env.local`, SKU `WP-<WC product id>`)
and migrates the publications and their WC products. This plan adds the rest of WooCommerce: the other products,
customers, past orders and download rights, plus the shop setup they need. All numbers are from the anonymised dump
`2026-11-09_wordpress-database_export.sql`; the words (product, shop product, WC product) are as in 06-products-plan.

Legend: **Proposed** = default we'll build unless someone objects. **Decide** = needs input before building that part.

---

## 1. Scope

**In scope:**
- Shop setup that the data depends on: channel, tax categories and rates, shipping methods, the "Mitglieder" customer
  group (§3).
- The WC products still for sale that aren't publications: tickets for events that haven't happened yet, and the
  standalone products (contract templates, fonts, subscriptions, a few books) (§4).
- Customers: registered buyers and guest buyers (§5).
- Past orders, as a read-only archive linked to the customer (§6).
- Download rights of past buyers, so they can download again (§7).

**Not migrated:** past tickets and other products that can't be bought any more (they live on in the order archive as
names), the 6 coupons (§8), failed and cancelled orders, order notes, Stripe saved cards, cart and attribution data.

**Not part of the migration, but needed before go-live** (built in the shop, listed in §10): logging in to the shop with
the site account, the member price, digital delivery, the Stripe payment plugin, invoices.

---

## 2. What's in WordPress

| | Count | Notes |
|---|---|---|
| WC products | 248 | 138 publications' (06-products-plan), 46 events', 55 standalone, plus drafts/trash |
| Orders (`shop_order`) | 1,142 | 2021-02 → 2026. 1,084 completed, 3 refunded, 1 processing, 31 cancelled, 23 failed. 5 refund posts |
| Revenue (completed) | €45,033 | 406 completed orders are free (event registrations) |
| Order lines | 1,558 | 622 event tickets, 550 publications, 370 standalone, 16 for deleted products. No attendee data on lines |
| Shipping lines | 435 | "pauschal" €5 (330), "Abholung vor Ort" free (105). Only Austria (one zone, `AT`) |
| Customers | 299 registered users with orders + 668 guest orders | 229 of the 299 users are migrated to Payload (02-plan); the other 70 had no published profile. Guest emails are anonymised to one value in the dump |
| Billing / shipping on users | 396 / 250 | WooCommerce `billing_*` / `shipping_*` user meta |
| Prices | always incl. VAT | `_prices_include_tax = yes` on every order, all EUR |
| Taxes | 5 rates | class `10` and the empty class → 10 %, `13` → 13 %, `20` → 20 %, `5` → 5 % (2020–21 rate, no current products). One product has `zero-rate` |
| Payments | Stripe | 682 charges; `_transaction_id` = Stripe charge id |
| Invoices | 777 numbered | per-year sequence `YYYYNNNNE` (e.g. `20260153E`), 4 credit notes. PDFs not in the DB |
| Download permissions | 459 | 34 products (218 for publications, 241 standalone), 149 orders. 356 for registered users, 103 for guests. 396 with a download limit, none expire. 465 downloads logged |
| Coupons | 6 | fixed amounts, 8 uses in total, 3 expired |
| Order notes | 4,679 | all automatic (status changes, Stripe, stock, invoice created) |

### 2.1 The non-publication WC products

| Group | Count | Examples | For sale today? |
|---|---|---|---|
| Event tickets (linked from an event) | 46 | workshops, webinars, talks; stock = seats | only for events that haven't ended: **3** at the dump date |
| Past tickets not linked to an event | ~25 | "Webinar: …", "Workshop: …", "TAKE THE TOUR …" 2022–2025 | no |
| Contract templates and info sheets | ~20 | "Musterverlagsvertrag", "Schutzrechte in Österreich", €15.90, member price 0, downloadable | yes, sold every month |
| Fonts | 3 | "Tern" Regular / Narrow / Italic, €113.90, downloadable | yes |
| Subscriptions | 3 | "Abo PAGE", "Abo form", "Abo 3x3" | yes: migrated as normal one-off products, designaustria passes the order on to the publisher |
| Books without a publication post | ~6 | "design\|er\|leben #7 …", "Frauen zählen", "Soleil (Print)" | yes, rarely |
| Other | 3 | "Mitgliedschaft" (the only variable product, never sold), "Veranstaltung test", "Durchblick im Versicherungsdschungel" (no price) | no |

The groups come from a heuristic (virtual + not downloadable = ticket, title patterns), so the list is reviewed by hand
(§4.2).

---

## 3. Shop setup (Proposed)

A seed script in the shop (`designaustria-shop/migration/wordpress/seed.ts`), idempotent, run on every database
before the import, so local, dev and production match. The import stops if any of it is missing.

- **Channel:** default channel, currency EUR, default language `de` (+ `en`), **`pricesIncludeTax = true`**.
- **Zone and tax:** zone "Österreich" (AT). Tax categories and rates:

  | Tax category | Rate | From `_tax_class` |
  |---|---|---|
  | Ermäßigt 10 % | 10 % | `10` and empty (the WooCommerce default class is 10 % here) |
  | Ermäßigt 13 % | 13 % | `13` |
  | Normal 20 % | 20 % | `20` |
  | Steuerfrei | 0 % | `zero-rate` |

  The 5 % rate (2020–21) isn't set up; it only appears on old order lines, which keep their own amounts (§6).
- **Shipping:** "Versand Österreich" flat €5 incl. VAT, "Abholung vor Ort" free, and "Digital" (free, only eligible
  when every line is a download or a ticket), because Vendure needs a shipping method on every order.
- **Customer group** "Mitglieder" (used by the member price, 06-products-plan §4.4).

---

## 4. Products

### 4.1 Event tickets (Proposed)

- Only tickets for events that **haven't ended at cutover** are migrated (3 in the dump). Past tickets can't be bought,
  and the archive keeps their names (§6).
- Shop product as in 06-products-plan §3.2: name = event title, `_regular_price`, member price, tax category, stock
  (`_stock` = seats left; no managed stock = unlimited). `woo_expiry_date` → custom field `salesEndAt` (the date the
  ticket stops being sold; the shop hides it after that).
- The event in Payload gets a **`shopSku`** field (the follow-up in 03-events-plan §8), filled from
  `legacy.productWpId` with the same `WP-<id>` rule, so the event page shows the price and the booking button. The 406
  free orders show tickets are also used as free registrations: a €0 ticket stays a €0 shop product.

### 4.2 Standalone products (Proposed)

Each still-sellable standalone WC product becomes a **product in Payload** (a page, like a publication) and a **shop
product** in Vendure, so it has a URL and can be found:

- Payload: `title`, `slug`, `body` from the WC product's text, `cover` / `gallery` from `_thumbnail_id` /
  `_product_image_gallery`, `legacyWpId` = WC product id (`legacy.wpPostType = 'product'`), `shopSku`. Categories as in the
  review file below (WC product categories aren't usable).
- Vendure: as for publications.

Which products are migrated, and their category, is a **reviewed file**, like `config/merges.json`:
`config/shop-products.json` lists every published standalone WC product with `migrate: true | false` and a `category`.
The extract fails on a published WC product that isn't in the file, so a new product in a later dump isn't silently
dropped. Starting point from the groups in §2.1: contract templates, fonts, subscriptions and books `true`; past
tickets and "Other" `false`.

### 4.3 Deleted and old products in orders

Order lines keep the WC product id and name as they were (§6). They link to a shop product only when that product is
migrated; otherwise the archive just shows the name.

---

## 5. Customers

### 5.1 Who logs in where (Proposed)

The site (Payload) is where people have an account and log in; nobody should get a second shop password. So Vendure
customers have **no Vendure login** of their own. A small Vendure plugin adds an `AuthenticationStrategy` that accepts
a short-lived token signed by the app for the logged-in user, and finds that user's Customer (§10). Migration-wise that
means: Customers are created without a User, and carry the keys to find them:

| Vendure Customer | From WP | Notes |
|---|---|---|
| `emailAddress` | user email (registered) / `_billing_email` (guest), lower-cased | unique in Vendure |
| `firstName`, `lastName`, `phoneNumber` | `billing_*` user meta, else the newest order's billing fields | |
| custom field `legacyWpUserId` | WP user id (registered only) | the same id as `users.legacyWpId` in Payload: how a logged-in member finds their customer |
| addresses | `billing_*` (default billing) and `shipping_*` (default shipping) | registered customers only; guests' addresses stay on their orders |
| groups | "Mitglieder" when the WP user has a migrated member profile | the member price; kept in sync from Payload later (§10) |

### 5.2 Registered and guest buyers

- **Registered buyers (299):** one Customer each. 229 have a Payload user (matched by `legacyWpUserId`); 70 don't
  (their profile wasn't published, so the user wasn't migrated). They get a Customer anyway, matched by email if they
  sign up on the new site.
- **Guest orders (668):** one Customer per billing email, without `legacyWpUserId`. Because the email is unique in
  Vendure, a guest order with the same email as a registered buyer ends up on **that buyer's** Customer, and that's
  intended: guest purchases and their downloads show up when the person logs in with that (verified) email.
- When someone logs in on the site for the first time, the auth plugin looks for a Customer by `legacyWpUserId`, then by
  (verified) email, and only creates one if neither exists.

---

## 6. Past orders: an archive, not Vendure orders

Past orders are imported into a **`LegacyOrder`** entity (with `LegacyOrderLine`) from a small shop plugin, not as
Vendure `Order`s.

Why: a Vendure Order is a live process. Importing 1,100 finished orders would mean bypassing price and tax calculation
(old prices, the 5 % rate, coupons), settling payments by hand, faking fulfilments, keeping stock and emails from
firing, and the result would still look like orders made in Vendure. Nobody needs to process them again: they're for
customers ("my orders", downloads) and for the bookkeeping archive.

| `LegacyOrder` | From WP |
|---|---|
| `legacyWpId` (unique), `orderKey` | order id, `_order_key` |
| `customer` → Customer | §5 |
| `placedAt`, `paidAt`, `completedAt` | `post_date`, `_paid_date`, `_completed_date` (Vienna → UTC) |
| `status` | `completed`, `refunded`, `processing` |
| `currency`, `total`, `tax`, `shipping`, `discount` (cents, incl. VAT) | `_order_*`, `_cart_discount` |
| `billingAddress`, `shippingAddress` (JSON) | `_billing_*`, `_shipping_*` |
| `shippingMethod` | the shipping line's name |
| `paymentMethod`, `transactionId` | `_payment_method_title`, `_transaction_id` (Stripe charge, for refunds and support) |
| `invoiceNumber`, `invoiceDate` | `_wcpdf_invoice_number`, `_wcpdf_invoice_date` |
| `refunds` (JSON) | the 5 refund posts: amount, date, reason |
| lines: `name`, `wcProductWpId`, `variant` → ProductVariant (nullable), `quantity`, `total`, `tax`, `taxRate` | order items |

- **Which orders:** completed (1,084), refunded (3), processing (1). Failed (23) and cancelled (31) were never paid and
  aren't migrated; they stay in the archived dump.
- Read-only in the dashboard (a list per customer), and in the Shop API as `activeCustomer.legacyOrders`: customers
  see their past orders under "my orders" on the site, next to new ones (date, items, total, invoice number).
- **Invoice numbers:** new invoices in Vendure must carry on the yearly sequence after the highest migrated number
  (e.g. after `20260153E`), else numbers repeat. The invoice plugin (§10) reads its start from the archive. The PDFs aren't
  in the DB; regenerating them from the archive is possible later but not planned.
- **Not migrated:** order notes (all automatic), IP address and user agent, attribution data, Stripe intent and source
  ids, `_cart_hash`.

---

## 7. Download rights

Past buyers keep their downloads (06-products-plan §4.6). A **`DigitalEntitlement`** entity in the same shop plugin
that does digital delivery (§10), used for new orders too:

| `DigitalEntitlement` | From `wp_woocommerce_downloadable_product_permissions` |
|---|---|
| `customer` → Customer | `user_id`, else `user_email` (guests, 103) → §5 |
| `variant` → ProductVariant | `product_id` → SKU `WP-<id>` |
| `legacyOrder` → LegacyOrder | `order_id` |
| `downloadsRemaining` | `downloads_remaining` (empty = unlimited) |
| `expiresAt` | `access_expires` (always empty) |
| `downloadCount` | `download_count` |
| `legacyPermissionId` | `permission_id` |

All 34 products with permissions are migrated (publications or standalone `migrate: true`); the extract fails if a
permission points to a product that isn't. The files themselves come with the media step (06-products-plan §6).

---

## 8. Coupons (Proposed)

Not migrated. 6 coupons with 8 uses in total, 3 expired, the others single codes sent to people. Staff recreate any that
are still promised as Vendure promotions. Used coupons stay visible as the `discount` on archived orders.

---

## 9. Pipeline

Extends the shop side from 06-products-plan §5 (same `.env.local`, guard and menu):

- **Extract** (in the app, as always): `shop-products.json` gets the event tickets and the reviewed standalone products;
  `products.json` (Payload) the standalone ones; new `customers.json`, `legacy-orders.json` and `entitlements.json`.
  These contain personal data, like `users.json`. Mapping in `lib/shop-mappers.ts` (orders, money in cents, addresses,
  invoice numbers) with unit tests. `config/shop-products.json` is read here.
- **Shop seed:** `seed.ts` (§3), before any import; the import checks it ran.
- **Shop import steps**, in order: `shop-products` (06) → `customers` → `legacy-orders` → `entitlements`. Same rules as
  the Payload side: a full run wipes what an earlier import wrote (by `legacyWpId` / `legacyWpUserId` /
  `legacyPermissionId`), keeps what was made in the shop, all in one transaction; `--only` upserts.
- **Payload:** events get their `shopSku` in the `events` step; standalone products come in through the `products` step.
- **Verify (shop):** counts per entity; order totals per year equal WordPress; every order line with a migrated product
  points to its variant; every entitlement's customer and variant exist; every registered customer with a
  `legacyWpUserId` that's in `users.json` (229); every `shopSku` in `products.json` and `events.json` has a variant.
- **Menu:** a "Shop" group (customers, orders, downloads), which brings `shop-products` along.

---

## 10. Shop features this depends on (not migration, before go-live)

1. **Login bridge:** the `AuthenticationStrategy` from §5.1, and the "Mitglieder" group kept in sync from Payload
   member profiles.
2. **Member price:** 06-products-plan §4.4.
3. **Digital delivery:** downloads after payment and from `DigitalEntitlement`, from private storage.
4. **Payments:** Vendure's Stripe plugin (`@vendure/payments-plugin`), with the same Stripe account.
5. **Invoices:** PDF invoices continuing the WooCommerce numbering (§6).
6. **Emails:** order confirmation and ticket emails in German.

---

## 11. Open questions

1. **The review file** (§4.2). Which standalone products are still for sale, and in which category? Staff go through
   `config/shop-products.json` before the cutover.
   *For now:* contract templates, fonts, subscriptions and books migrated; past tickets and "Other" not.
