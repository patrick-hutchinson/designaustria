import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_members_phones_type" ADD VALUE 'fax';
  ALTER TYPE "public"."enum_organizations_phones_type" ADD VALUE 'fax';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Hand-edited: rolling back clears the type of fax numbers (the value no longer exists in the enum).
  await db.execute(sql`
   ALTER TABLE "members_phones" ALTER COLUMN "type" SET DATA TYPE text;
  UPDATE "members_phones" SET "type" = NULL WHERE "type" = 'fax';
  DROP TYPE "public"."enum_members_phones_type";
  CREATE TYPE "public"."enum_members_phones_type" AS ENUM('office', 'mobile');
  ALTER TABLE "members_phones" ALTER COLUMN "type" SET DATA TYPE "public"."enum_members_phones_type" USING "type"::"public"."enum_members_phones_type";
  ALTER TABLE "organizations_phones" ALTER COLUMN "type" SET DATA TYPE text;
  UPDATE "organizations_phones" SET "type" = NULL WHERE "type" = 'fax';
  DROP TYPE "public"."enum_organizations_phones_type";
  CREATE TYPE "public"."enum_organizations_phones_type" AS ENUM('office', 'mobile');
  ALTER TABLE "organizations_phones" ALTER COLUMN "type" SET DATA TYPE "public"."enum_organizations_phones_type" USING "type"::"public"."enum_organizations_phones_type";`)
}
