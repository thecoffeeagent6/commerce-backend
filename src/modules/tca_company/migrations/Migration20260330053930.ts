import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260330053930 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tca_company" drop constraint if exists "tca_company_external_company_id_unique";`);
    this.addSql(`create table if not exists "tca_company" ("id" text not null, "external_company_id" text not null, "name" text not null default '', "slug" text not null default '', "is_active" boolean not null default true, "ordering_enabled" boolean not null default false, "supports_pickup" boolean not null default true, "supports_drive_thru" boolean not null default true, "supports_dine_in" boolean not null default false, "medusa_sales_channel_id" text null, "medusa_stock_location_id" text null, "medusa_default_region_id" text null, "sync_status" text not null default 'not_synced', "last_sync_at" timestamptz null, "last_sync_error" text null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tca_company_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tca_company_external_company_id_unique" ON "tca_company" ("external_company_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tca_company_deleted_at" ON "tca_company" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tca_company" cascade;`);
  }

}
