import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_mux_video_playback_options_playback_policy" AS ENUM('signed', 'public');
  CREATE TABLE "events_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer,
  	"mux_video_id" integer
  );
  
  CREATE TABLE "mux_video_playback_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"playback_id" varchar,
  	"playback_policy" "enum_mux_video_playback_options_playback_policy"
  );
  
  CREATE TABLE "mux_video" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"asset_id" varchar,
  	"duration" numeric,
  	"poster_timestamp" numeric,
  	"aspect_ratio" varchar,
  	"max_width" numeric,
  	"max_height" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "events" DROP CONSTRAINT "events_media_id_media_id_fk";
  
  DROP INDEX "events_media_idx";
  ALTER TABLE "media" ADD COLUMN "_objectkey" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "mux_video_id" integer;
  ALTER TABLE "events_rels" ADD CONSTRAINT "events_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events_rels" ADD CONSTRAINT "events_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events_rels" ADD CONSTRAINT "events_rels_mux_video_fk" FOREIGN KEY ("mux_video_id") REFERENCES "public"."mux_video"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "mux_video_playback_options" ADD CONSTRAINT "mux_video_playback_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."mux_video"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "events_rels_order_idx" ON "events_rels" USING btree ("order");
  CREATE INDEX "events_rels_parent_idx" ON "events_rels" USING btree ("parent_id");
  CREATE INDEX "events_rels_path_idx" ON "events_rels" USING btree ("path");
  CREATE INDEX "events_rels_media_id_idx" ON "events_rels" USING btree ("media_id");
  CREATE INDEX "events_rels_mux_video_id_idx" ON "events_rels" USING btree ("mux_video_id");
  CREATE INDEX "mux_video_playback_options_order_idx" ON "mux_video_playback_options" USING btree ("_order");
  CREATE INDEX "mux_video_playback_options_parent_id_idx" ON "mux_video_playback_options" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "mux_video_title_idx" ON "mux_video" USING btree ("title");
  CREATE UNIQUE INDEX "mux_video_asset_id_idx" ON "mux_video" USING btree ("asset_id");
  CREATE INDEX "mux_video_updated_at_idx" ON "mux_video" USING btree ("updated_at");
  CREATE INDEX "mux_video_created_at_idx" ON "mux_video" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mux_video_fk" FOREIGN KEY ("mux_video_id") REFERENCES "public"."mux_video"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_mux_video_id_idx" ON "payload_locked_documents_rels" USING btree ("mux_video_id");
  -- Hand-written: keep each event's existing image by moving it into the new media field.
  INSERT INTO "events_rels" ("order", "parent_id", "path", "media_id")
  SELECT 1, "id", 'media', "media_id" FROM "events" WHERE "media_id" IS NOT NULL;
  ALTER TABLE "events" DROP COLUMN "media_id";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   -- Hand-written: move images back to events.media_id (videos can't go back: that column only holds images).
  ALTER TABLE "events" ADD COLUMN "media_id" integer;
  UPDATE "events" e SET "media_id" = r."media_id"
  FROM "events_rels" r WHERE r."parent_id" = e."id" AND r."path" = 'media' AND r."media_id" IS NOT NULL;
   ALTER TABLE "events_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "mux_video_playback_options" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "mux_video" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "events_rels" CASCADE;
  DROP TABLE "mux_video_playback_options" CASCADE;
  DROP TABLE "mux_video" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_mux_video_fk";
  
  DROP INDEX "payload_locked_documents_rels_mux_video_id_idx";
  ALTER TABLE "events" ADD CONSTRAINT "events_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "events_media_idx" ON "events" USING btree ("media_id");
  ALTER TABLE "media" DROP COLUMN "_objectkey";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "mux_video_id";
  DROP TYPE "public"."enum_mux_video_playback_options_playback_policy";`)
}
