import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_mux_video_playback_mode" AS ENUM('auto', 'loop', 'player');
  ALTER TABLE "mux_video" ADD COLUMN "playback_mode" "enum_mux_video_playback_mode" DEFAULT 'auto';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "mux_video" DROP COLUMN "playback_mode";
  DROP TYPE "public"."enum_mux_video_playback_mode";`)
}
