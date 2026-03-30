import { model } from "@medusajs/framework/utils"

/**
 * TCA shop/company representation inside Medusa (commerce boundary).
 * Firestore `companies/{id}` remains canonical for app identity; `external_company_id` mirrors that id.
 */
const TcaCompany = model
  .define("tca_company", {
    id: model.id({ prefix: "tcacomp" }).primaryKey(),
    external_company_id: model.text().unique(),
    name: model.text().default(""),
    slug: model.text().default(""),
    is_active: model.boolean().default(true),
    ordering_enabled: model.boolean().default(false),
    supports_pickup: model.boolean().default(true),
    supports_drive_thru: model.boolean().default(true),
    supports_dine_in: model.boolean().default(false),
    medusa_sales_channel_id: model.text().nullable(),
    medusa_stock_location_id: model.text().nullable(),
    medusa_default_region_id: model.text().nullable(),
    sync_status: model.text().default("not_synced"),
    last_sync_at: model.dateTime().nullable(),
    last_sync_error: model.text().nullable(),
    metadata: model.json().nullable(),
  })

export default TcaCompany
