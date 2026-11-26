import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   -- Edited by hand: the events collection is rebuilt for the WordPress migration (migration/wordpress/docs/03-events-plan.md §3).
   -- Events entered in the old model are test data and are deleted (child tables go with them via ON DELETE CASCADE),
   -- so the new required column starts_at can be added.
   DELETE FROM "events";
   CREATE TYPE "public"."enum_events_admission_prices_kind" AS ENUM('regular', 'reduced', 'members', 'other');
  CREATE TYPE "public"."enum_events_type" AS ENUM('internal', 'external');
  CREATE TYPE "public"."enum_events_visibility" AS ENUM('everywhere', 'notOnHome', 'hidden');
  CREATE TABLE "events_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar NOT NULL,
  	"label" varchar
  );
  
  CREATE TABLE "events_admission_prices" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_events_admission_prices_kind" DEFAULT 'regular' NOT NULL,
  	"amount" varchar
  );
  
  CREATE TABLE "events_admission_prices_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "events_numbers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"number" numeric,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL
  );
  
  ALTER TABLE "events" ADD COLUMN "starts_at" timestamp(3) with time zone NOT NULL;
  ALTER TABLE "events" ADD COLUMN "ends_at" timestamp(3) with time zone;
  ALTER TABLE "events" ADD COLUMN "venue_street" varchar;
  ALTER TABLE "events" ADD COLUMN "venue_zip" varchar;
  ALTER TABLE "events" ADD COLUMN "venue_city" varchar;
  ALTER TABLE "events" ADD COLUMN "venue_country" varchar;
  ALTER TABLE "events" ADD COLUMN "admission_show" boolean DEFAULT true;
  ALTER TABLE "events" ADD COLUMN "opening_hours_show" boolean DEFAULT true;
  ALTER TABLE "events" ADD COLUMN "legacy_wp_status" varchar;
  ALTER TABLE "events" ADD COLUMN "legacy_en_wp_id" numeric;
  ALTER TABLE "events" ADD COLUMN "legacy_product_wp_id" numeric;
  ALTER TABLE "events" ADD COLUMN "legacy_raw_place" varchar;
  ALTER TABLE "events" ADD COLUMN "legacy_raw_costs" varchar;
  ALTER TABLE "events" ADD COLUMN "type" "enum_events_type" DEFAULT 'internal' NOT NULL;
  ALTER TABLE "events" ADD COLUMN "visibility" "enum_events_visibility" DEFAULT 'everywhere' NOT NULL;
  ALTER TABLE "events" ADD COLUMN "badge" varchar;
  ALTER TABLE "events" ADD COLUMN "legacy_wp_id" numeric;
  ALTER TABLE "events_locales" ADD COLUMN "venue_name" varchar;
  ALTER TABLE "events_locales" ADD COLUMN "admission_note" varchar;
  ALTER TABLE "events_locales" ADD COLUMN "opening_hours_text" varchar;
  ALTER TABLE "events_locales" ADD COLUMN "notes" varchar;
  ALTER TABLE "events_locales" ADD COLUMN "slug" varchar;
  ALTER TABLE "events_rels" ADD COLUMN "categories_id" integer;
  ALTER TABLE "events_links" ADD CONSTRAINT "events_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events_admission_prices" ADD CONSTRAINT "events_admission_prices_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events_admission_prices_locales" ADD CONSTRAINT "events_admission_prices_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."events_admission_prices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events_numbers" ADD CONSTRAINT "events_numbers_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "events_links_order_idx" ON "events_links" USING btree ("_order");
  CREATE INDEX "events_links_parent_id_idx" ON "events_links" USING btree ("_parent_id");
  CREATE INDEX "events_admission_prices_order_idx" ON "events_admission_prices" USING btree ("_order");
  CREATE INDEX "events_admission_prices_parent_id_idx" ON "events_admission_prices" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "events_admission_prices_locales_locale_parent_id_unique" ON "events_admission_prices_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "events_admission_prices_locales_parent_id_idx" ON "events_admission_prices_locales" USING btree ("_parent_id");
  CREATE INDEX "events_numbers_order_parent_idx" ON "events_numbers" USING btree ("order","parent_id");
  ALTER TABLE "events_rels" ADD CONSTRAINT "events_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "events_starts_at_idx" ON "events" USING btree ("starts_at");
  CREATE INDEX "events_visibility_idx" ON "events" USING btree ("visibility");
  CREATE UNIQUE INDEX "events_legacy_wp_id_idx" ON "events" USING btree ("legacy_wp_id");
  CREATE UNIQUE INDEX "events_slug_idx" ON "events_locales" USING btree ("slug","_locale");
  CREATE INDEX "events_rels_categories_id_idx" ON "events_rels" USING btree ("categories_id");
  ALTER TABLE "events" DROP COLUMN "date";
  ALTER TABLE "events_locales" DROP COLUMN "location";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   -- Edited by hand: the old model has required columns (date, location) that new events can't fill.
   DELETE FROM "events";
   ALTER TABLE "events_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "events_admission_prices" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "events_admission_prices_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "events_numbers" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "events_links" CASCADE;
  DROP TABLE "events_admission_prices" CASCADE;
  DROP TABLE "events_admission_prices_locales" CASCADE;
  DROP TABLE "events_numbers" CASCADE;
  ALTER TABLE "events_rels" DROP CONSTRAINT "events_rels_categories_fk";
  
  DROP INDEX "events_starts_at_idx";
  DROP INDEX "events_visibility_idx";
  DROP INDEX "events_legacy_wp_id_idx";
  DROP INDEX "events_slug_idx";
  DROP INDEX "events_rels_categories_id_idx";
  ALTER TABLE "events" ADD COLUMN "date" timestamp(3) with time zone NOT NULL;
  ALTER TABLE "events_locales" ADD COLUMN "location" varchar NOT NULL;
  ALTER TABLE "events" DROP COLUMN "starts_at";
  ALTER TABLE "events" DROP COLUMN "ends_at";
  ALTER TABLE "events" DROP COLUMN "venue_street";
  ALTER TABLE "events" DROP COLUMN "venue_zip";
  ALTER TABLE "events" DROP COLUMN "venue_city";
  ALTER TABLE "events" DROP COLUMN "venue_country";
  ALTER TABLE "events" DROP COLUMN "admission_show";
  ALTER TABLE "events" DROP COLUMN "opening_hours_show";
  ALTER TABLE "events" DROP COLUMN "legacy_wp_status";
  ALTER TABLE "events" DROP COLUMN "legacy_en_wp_id";
  ALTER TABLE "events" DROP COLUMN "legacy_product_wp_id";
  ALTER TABLE "events" DROP COLUMN "legacy_raw_place";
  ALTER TABLE "events" DROP COLUMN "legacy_raw_costs";
  ALTER TABLE "events" DROP COLUMN "type";
  ALTER TABLE "events" DROP COLUMN "visibility";
  ALTER TABLE "events" DROP COLUMN "badge";
  ALTER TABLE "events" DROP COLUMN "legacy_wp_id";
  ALTER TABLE "events_locales" DROP COLUMN "venue_name";
  ALTER TABLE "events_locales" DROP COLUMN "admission_note";
  ALTER TABLE "events_locales" DROP COLUMN "opening_hours_text";
  ALTER TABLE "events_locales" DROP COLUMN "notes";
  ALTER TABLE "events_locales" DROP COLUMN "slug";
  ALTER TABLE "events_rels" DROP COLUMN "categories_id";
  DROP TYPE "public"."enum_events_admission_prices_kind";
  DROP TYPE "public"."enum_events_type";
  DROP TYPE "public"."enum_events_visibility";`)
}
