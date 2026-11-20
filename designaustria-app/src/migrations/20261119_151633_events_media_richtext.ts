import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   -- Edited by hand: plain-text descriptions can't be converted to rich text (Lexical JSON),
   -- so existing descriptions are cleared. Re-enter them in the admin after migrating.
   ALTER TABLE "events_locales" ALTER COLUMN "description" SET DATA TYPE jsonb USING NULL;
  ALTER TABLE "events" ADD COLUMN "media_id" integer;
  ALTER TABLE "events" ADD CONSTRAINT "events_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "events_media_idx" ON "events" USING btree ("media_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "events" DROP CONSTRAINT "events_media_id_media_id_fk";
  
  DROP INDEX "events_media_idx";
  ALTER TABLE "events_locales" ALTER COLUMN "description" SET DATA TYPE varchar USING NULL;
  ALTER TABLE "events" DROP COLUMN "media_id";`)
}
