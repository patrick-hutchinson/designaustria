import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_roles" AS ENUM('admin', 'staff', 'member');
  CREATE TYPE "public"."enum_members_addresses_type" AS ENUM('office', 'private');
  CREATE TYPE "public"."enum_members_addresses_visibility" AS ENUM('public', 'private');
  CREATE TYPE "public"."enum_members_phones_type" AS ENUM('office', 'mobile');
  CREATE TYPE "public"."enum_members_phones_visibility" AS ENUM('public', 'private');
  CREATE TYPE "public"."enum_members_links_type" AS ENUM('web', 'instagram', 'facebook', 'behance', 'linkedin', 'x', 'xing', 'blog');
  CREATE TYPE "public"."enum_members_functions" AS ENUM('staff', 'board');
  CREATE TYPE "public"."enum_members_portfolio_visibility" AS ENUM('public', 'private');
  CREATE TYPE "public"."enum_members_documents_type" AS ENUM('dissertation', 'thesis', 'paper', 'publication', 'book', 'misc');
  CREATE TYPE "public"."enum_members_legacy_display_opt_ins" AS ENUM('email', 'frontpage');
  CREATE TYPE "public"."enum_members_salutation" AS ENUM('d', 'f', 'm', 'i');
  CREATE TYPE "public"."enum_members_employment_type" AS ENUM('employed', 'selfEmployed');
  CREATE TYPE "public"."enum_members_tier" AS ENUM('standard', 'youngProfessional', 'student', 'retiree', 'corporate', 'education');
  CREATE TYPE "public"."enum_members_honorary" AS ENUM('member', 'president');
  CREATE TYPE "public"."enum_members_billing_payment_type" AS ENUM('sepa');
  CREATE TYPE "public"."enum_members_billing_payment_frequency" AS ENUM('yearly', 'quarterly');
  CREATE TYPE "public"."enum_members_profile_status" AS ENUM('publish', 'pending', 'draft', 'private');
  CREATE TYPE "public"."enum_organizations_partner_status" AS ENUM('partner', 'premium', 'education');
  CREATE TYPE "public"."enum_organizations_addresses_type" AS ENUM('office', 'private');
  CREATE TYPE "public"."enum_organizations_addresses_visibility" AS ENUM('public', 'private');
  CREATE TYPE "public"."enum_organizations_phones_type" AS ENUM('office', 'mobile');
  CREATE TYPE "public"."enum_organizations_phones_visibility" AS ENUM('public', 'private');
  CREATE TYPE "public"."enum_organizations_links_type" AS ENUM('web', 'instagram', 'facebook', 'behance', 'linkedin', 'x', 'xing', 'blog');
  CREATE TYPE "public"."enum_organizations_portfolio_visibility" AS ENUM('public', 'private');
  CREATE TYPE "public"."enum_organizations_documents_type" AS ENUM('dissertation', 'thesis', 'paper', 'publication', 'book', 'misc');
  CREATE TYPE "public"."enum_organizations_profile_status" AS ENUM('publish', 'pending', 'draft', 'private');
  CREATE TYPE "public"."enum_organization_members_role" AS ENUM('member', 'admin');
  CREATE TABLE "users_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_users_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "members_addresses" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_members_addresses_type",
  	"visibility" "enum_members_addresses_visibility" DEFAULT 'private',
  	"street" varchar,
  	"number" varchar,
  	"zip" varchar,
  	"city" varchar,
  	"country" varchar
  );
  
  CREATE TABLE "members_phones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_members_phones_type",
  	"number" varchar,
  	"visibility" "enum_members_phones_visibility" DEFAULT 'private'
  );
  
  CREATE TABLE "members_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_members_links_type" DEFAULT 'web',
  	"url" varchar
  );
  
  CREATE TABLE "members_functions" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_members_functions",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "members_portfolio" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"visibility" "enum_members_portfolio_visibility" DEFAULT 'public'
  );
  
  CREATE TABLE "members_documents" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_members_documents_type",
  	"name" varchar,
  	"file_wp_id" numeric
  );
  
  CREATE TABLE "members_legacy_display_opt_ins" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_members_legacy_display_opt_ins",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "members" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"full_name" varchar,
  	"salutation" "enum_members_salutation",
  	"title" varchar,
  	"first_name" varchar,
  	"last_name" varchar,
  	"birthdate" timestamp(3) with time zone,
  	"death_year" numeric,
  	"contact_email" varchar,
  	"contact_email_public" boolean,
  	"company_name" varchar,
  	"job_title" varchar,
  	"employment_type" "enum_members_employment_type",
  	"about" varchar,
  	"motto" varchar,
  	"education" varchar,
  	"additional_qualification" varchar,
  	"other_focus" varchar,
  	"keywords" varchar,
  	"member_number" varchar,
  	"tier" "enum_members_tier",
  	"honorary" "enum_members_honorary",
  	"bildrecht" boolean,
  	"newsletter" boolean,
  	"billing_payment_type" "enum_members_billing_payment_type",
  	"billing_payment_frequency" "enum_members_billing_payment_frequency",
  	"billing_iban" varchar,
  	"billing_fee_override" numeric,
  	"billing_fee_note" varchar,
  	"legacy_created_at" timestamp(3) with time zone,
  	"legacy_motivation" varchar,
  	"legacy_active_flag" boolean,
  	"legacy_avatar_wp_id" numeric,
  	"legacy_student_proof_wp_id" numeric,
  	"profile_status" "enum_members_profile_status" DEFAULT 'draft' NOT NULL,
  	"user_id" integer,
  	"slug" varchar,
  	"legacy_wp_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "members_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "members_numbers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"number" numeric,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL
  );
  
  CREATE TABLE "members_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"categories_id" integer
  );
  
  CREATE TABLE "organizations_partner_status" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_organizations_partner_status",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "organizations_addresses" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_organizations_addresses_type",
  	"visibility" "enum_organizations_addresses_visibility" DEFAULT 'private',
  	"street" varchar,
  	"number" varchar,
  	"zip" varchar,
  	"city" varchar,
  	"country" varchar
  );
  
  CREATE TABLE "organizations_phones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_organizations_phones_type",
  	"number" varchar,
  	"visibility" "enum_organizations_phones_visibility" DEFAULT 'private'
  );
  
  CREATE TABLE "organizations_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_organizations_links_type" DEFAULT 'web',
  	"url" varchar
  );
  
  CREATE TABLE "organizations_portfolio" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"visibility" "enum_organizations_portfolio_visibility" DEFAULT 'public'
  );
  
  CREATE TABLE "organizations_documents" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_organizations_documents_type",
  	"name" varchar,
  	"file_wp_id" numeric
  );
  
  CREATE TABLE "organizations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"member_number" varchar,
  	"about" varchar,
  	"legacy_created_at" timestamp(3) with time zone,
  	"legacy_logo_wp_id" numeric,
  	"profile_status" "enum_organizations_profile_status" DEFAULT 'draft' NOT NULL,
  	"slug" varchar,
  	"legacy_wp_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "organizations_numbers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"number" numeric,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL
  );
  
  CREATE TABLE "organizations_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"categories_id" integer
  );
  
  CREATE TABLE "organization_members" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"organization_id" integer NOT NULL,
  	"member_id" integer NOT NULL,
  	"role" "enum_organization_members_role" DEFAULT 'member' NOT NULL,
  	"legacy_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"parent_id" integer,
  	"legacy_wp_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "categories_locales" (
  	"title" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "users" ADD COLUMN "legacy_password_hash" varchar;
  ALTER TABLE "users" ADD COLUMN "legacy_wp_id" numeric;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "members_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "organizations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "organization_members_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "categories_id" integer;
  ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "members_addresses" ADD CONSTRAINT "members_addresses_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "members_phones" ADD CONSTRAINT "members_phones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "members_links" ADD CONSTRAINT "members_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "members_functions" ADD CONSTRAINT "members_functions_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "members_portfolio" ADD CONSTRAINT "members_portfolio_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "members_documents" ADD CONSTRAINT "members_documents_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "members_legacy_display_opt_ins" ADD CONSTRAINT "members_legacy_display_opt_ins_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "members_texts" ADD CONSTRAINT "members_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "members_numbers" ADD CONSTRAINT "members_numbers_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "members_rels" ADD CONSTRAINT "members_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "members_rels" ADD CONSTRAINT "members_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "organizations_partner_status" ADD CONSTRAINT "organizations_partner_status_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "organizations_addresses" ADD CONSTRAINT "organizations_addresses_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "organizations_phones" ADD CONSTRAINT "organizations_phones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "organizations_links" ADD CONSTRAINT "organizations_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "organizations_portfolio" ADD CONSTRAINT "organizations_portfolio_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "organizations_documents" ADD CONSTRAINT "organizations_documents_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "organizations_numbers" ADD CONSTRAINT "organizations_numbers_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "organizations_rels" ADD CONSTRAINT "organizations_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "organizations_rels" ADD CONSTRAINT "organizations_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories_locales" ADD CONSTRAINT "categories_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_roles_order_idx" ON "users_roles" USING btree ("order");
  CREATE INDEX "users_roles_parent_idx" ON "users_roles" USING btree ("parent_id");
  CREATE INDEX "members_addresses_order_idx" ON "members_addresses" USING btree ("_order");
  CREATE INDEX "members_addresses_parent_id_idx" ON "members_addresses" USING btree ("_parent_id");
  CREATE INDEX "members_phones_order_idx" ON "members_phones" USING btree ("_order");
  CREATE INDEX "members_phones_parent_id_idx" ON "members_phones" USING btree ("_parent_id");
  CREATE INDEX "members_links_order_idx" ON "members_links" USING btree ("_order");
  CREATE INDEX "members_links_parent_id_idx" ON "members_links" USING btree ("_parent_id");
  CREATE INDEX "members_functions_order_idx" ON "members_functions" USING btree ("order");
  CREATE INDEX "members_functions_parent_idx" ON "members_functions" USING btree ("parent_id");
  CREATE INDEX "members_portfolio_order_idx" ON "members_portfolio" USING btree ("_order");
  CREATE INDEX "members_portfolio_parent_id_idx" ON "members_portfolio" USING btree ("_parent_id");
  CREATE INDEX "members_documents_order_idx" ON "members_documents" USING btree ("_order");
  CREATE INDEX "members_documents_parent_id_idx" ON "members_documents" USING btree ("_parent_id");
  CREATE INDEX "members_legacy_display_opt_ins_order_idx" ON "members_legacy_display_opt_ins" USING btree ("order");
  CREATE INDEX "members_legacy_display_opt_ins_parent_idx" ON "members_legacy_display_opt_ins" USING btree ("parent_id");
  CREATE INDEX "members_full_name_idx" ON "members" USING btree ("full_name");
  CREATE INDEX "members_member_number_idx" ON "members" USING btree ("member_number");
  CREATE INDEX "members_profile_status_idx" ON "members" USING btree ("profile_status");
  CREATE UNIQUE INDEX "members_user_idx" ON "members" USING btree ("user_id");
  CREATE INDEX "members_slug_idx" ON "members" USING btree ("slug");
  CREATE UNIQUE INDEX "members_legacy_wp_id_idx" ON "members" USING btree ("legacy_wp_id");
  CREATE INDEX "members_updated_at_idx" ON "members" USING btree ("updated_at");
  CREATE INDEX "members_created_at_idx" ON "members" USING btree ("created_at");
  CREATE INDEX "members_texts_order_parent" ON "members_texts" USING btree ("order","parent_id");
  CREATE INDEX "members_numbers_order_parent_idx" ON "members_numbers" USING btree ("order","parent_id");
  CREATE INDEX "members_rels_order_idx" ON "members_rels" USING btree ("order");
  CREATE INDEX "members_rels_parent_idx" ON "members_rels" USING btree ("parent_id");
  CREATE INDEX "members_rels_path_idx" ON "members_rels" USING btree ("path");
  CREATE INDEX "members_rels_categories_id_idx" ON "members_rels" USING btree ("categories_id");
  CREATE INDEX "organizations_partner_status_order_idx" ON "organizations_partner_status" USING btree ("order");
  CREATE INDEX "organizations_partner_status_parent_idx" ON "organizations_partner_status" USING btree ("parent_id");
  CREATE INDEX "organizations_addresses_order_idx" ON "organizations_addresses" USING btree ("_order");
  CREATE INDEX "organizations_addresses_parent_id_idx" ON "organizations_addresses" USING btree ("_parent_id");
  CREATE INDEX "organizations_phones_order_idx" ON "organizations_phones" USING btree ("_order");
  CREATE INDEX "organizations_phones_parent_id_idx" ON "organizations_phones" USING btree ("_parent_id");
  CREATE INDEX "organizations_links_order_idx" ON "organizations_links" USING btree ("_order");
  CREATE INDEX "organizations_links_parent_id_idx" ON "organizations_links" USING btree ("_parent_id");
  CREATE INDEX "organizations_portfolio_order_idx" ON "organizations_portfolio" USING btree ("_order");
  CREATE INDEX "organizations_portfolio_parent_id_idx" ON "organizations_portfolio" USING btree ("_parent_id");
  CREATE INDEX "organizations_documents_order_idx" ON "organizations_documents" USING btree ("_order");
  CREATE INDEX "organizations_documents_parent_id_idx" ON "organizations_documents" USING btree ("_parent_id");
  CREATE INDEX "organizations_member_number_idx" ON "organizations" USING btree ("member_number");
  CREATE INDEX "organizations_profile_status_idx" ON "organizations" USING btree ("profile_status");
  CREATE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");
  CREATE UNIQUE INDEX "organizations_legacy_wp_id_idx" ON "organizations" USING btree ("legacy_wp_id");
  CREATE INDEX "organizations_updated_at_idx" ON "organizations" USING btree ("updated_at");
  CREATE INDEX "organizations_created_at_idx" ON "organizations" USING btree ("created_at");
  CREATE INDEX "organizations_numbers_order_parent_idx" ON "organizations_numbers" USING btree ("order","parent_id");
  CREATE INDEX "organizations_rels_order_idx" ON "organizations_rels" USING btree ("order");
  CREATE INDEX "organizations_rels_parent_idx" ON "organizations_rels" USING btree ("parent_id");
  CREATE INDEX "organizations_rels_path_idx" ON "organizations_rels" USING btree ("path");
  CREATE INDEX "organizations_rels_categories_id_idx" ON "organizations_rels" USING btree ("categories_id");
  CREATE INDEX "organization_members_organization_idx" ON "organization_members" USING btree ("organization_id");
  CREATE INDEX "organization_members_member_idx" ON "organization_members" USING btree ("member_id");
  CREATE UNIQUE INDEX "organization_members_legacy_key_idx" ON "organization_members" USING btree ("legacy_key");
  CREATE INDEX "organization_members_updated_at_idx" ON "organization_members" USING btree ("updated_at");
  CREATE INDEX "organization_members_created_at_idx" ON "organization_members" USING btree ("created_at");
  CREATE UNIQUE INDEX "organization_member_idx" ON "organization_members" USING btree ("organization_id","member_id");
  CREATE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");
  CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");
  CREATE UNIQUE INDEX "categories_legacy_wp_id_idx" ON "categories" USING btree ("legacy_wp_id");
  CREATE INDEX "categories_updated_at_idx" ON "categories" USING btree ("updated_at");
  CREATE INDEX "categories_created_at_idx" ON "categories" USING btree ("created_at");
  CREATE UNIQUE INDEX "categories_locales_locale_parent_id_unique" ON "categories_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "categories_locales_parent_id_idx" ON "categories_locales" USING btree ("_parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_members_fk" FOREIGN KEY ("members_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_organizations_fk" FOREIGN KEY ("organizations_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_organization_members_fk" FOREIGN KEY ("organization_members_id") REFERENCES "public"."organization_members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "users_legacy_wp_id_idx" ON "users" USING btree ("legacy_wp_id");
  CREATE INDEX "payload_locked_documents_rels_members_id_idx" ON "payload_locked_documents_rels" USING btree ("members_id");
  CREATE INDEX "payload_locked_documents_rels_organizations_id_idx" ON "payload_locked_documents_rels" USING btree ("organizations_id");
  CREATE INDEX "payload_locked_documents_rels_organization_members_id_idx" ON "payload_locked_documents_rels" USING btree ("organization_members_id");
  CREATE INDEX "payload_locked_documents_rels_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("categories_id");`)

  // Hand-written: before this migration every account was an admin (roles didn't exist).
  // Give existing users the admin role so nobody gets locked out of /admin.
  await db.execute(sql`
  INSERT INTO "users_roles" ("order", "parent_id", "value")
  SELECT 1, u."id", 'admin' FROM "users" u
  WHERE NOT EXISTS (SELECT 1 FROM "users_roles" r WHERE r."parent_id" = u."id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users_roles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members_addresses" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members_phones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members_functions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members_portfolio" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members_documents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members_legacy_display_opt_ins" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members_numbers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "organizations_partner_status" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "organizations_addresses" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "organizations_phones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "organizations_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "organizations_portfolio" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "organizations_documents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "organizations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "organizations_numbers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "organizations_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "organization_members" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "categories" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "categories_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "users_roles" CASCADE;
  DROP TABLE "members_addresses" CASCADE;
  DROP TABLE "members_phones" CASCADE;
  DROP TABLE "members_links" CASCADE;
  DROP TABLE "members_functions" CASCADE;
  DROP TABLE "members_portfolio" CASCADE;
  DROP TABLE "members_documents" CASCADE;
  DROP TABLE "members_legacy_display_opt_ins" CASCADE;
  DROP TABLE "members" CASCADE;
  DROP TABLE "members_texts" CASCADE;
  DROP TABLE "members_numbers" CASCADE;
  DROP TABLE "members_rels" CASCADE;
  DROP TABLE "organizations_partner_status" CASCADE;
  DROP TABLE "organizations_addresses" CASCADE;
  DROP TABLE "organizations_phones" CASCADE;
  DROP TABLE "organizations_links" CASCADE;
  DROP TABLE "organizations_portfolio" CASCADE;
  DROP TABLE "organizations_documents" CASCADE;
  DROP TABLE "organizations" CASCADE;
  DROP TABLE "organizations_numbers" CASCADE;
  DROP TABLE "organizations_rels" CASCADE;
  DROP TABLE "organization_members" CASCADE;
  DROP TABLE "categories" CASCADE;
  DROP TABLE "categories_locales" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_members_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_organizations_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_organization_members_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_categories_fk";
  
  DROP INDEX IF EXISTS "users_legacy_wp_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_members_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_organizations_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_organization_members_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_categories_id_idx";
  ALTER TABLE "users" DROP COLUMN "legacy_password_hash";
  ALTER TABLE "users" DROP COLUMN "legacy_wp_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "members_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "organizations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "organization_members_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "categories_id";
  DROP TYPE "public"."enum_users_roles";
  DROP TYPE "public"."enum_members_addresses_type";
  DROP TYPE "public"."enum_members_addresses_visibility";
  DROP TYPE "public"."enum_members_phones_type";
  DROP TYPE "public"."enum_members_phones_visibility";
  DROP TYPE "public"."enum_members_links_type";
  DROP TYPE "public"."enum_members_functions";
  DROP TYPE "public"."enum_members_portfolio_visibility";
  DROP TYPE "public"."enum_members_documents_type";
  DROP TYPE "public"."enum_members_legacy_display_opt_ins";
  DROP TYPE "public"."enum_members_salutation";
  DROP TYPE "public"."enum_members_employment_type";
  DROP TYPE "public"."enum_members_tier";
  DROP TYPE "public"."enum_members_honorary";
  DROP TYPE "public"."enum_members_billing_payment_type";
  DROP TYPE "public"."enum_members_billing_payment_frequency";
  DROP TYPE "public"."enum_members_profile_status";
  DROP TYPE "public"."enum_organizations_partner_status";
  DROP TYPE "public"."enum_organizations_addresses_type";
  DROP TYPE "public"."enum_organizations_addresses_visibility";
  DROP TYPE "public"."enum_organizations_phones_type";
  DROP TYPE "public"."enum_organizations_phones_visibility";
  DROP TYPE "public"."enum_organizations_links_type";
  DROP TYPE "public"."enum_organizations_portfolio_visibility";
  DROP TYPE "public"."enum_organizations_documents_type";
  DROP TYPE "public"."enum_organizations_profile_status";
  DROP TYPE "public"."enum_organization_members_role";`)
}
