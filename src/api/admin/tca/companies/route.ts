import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  clamp,
  getStripeConnectedAccountIdFromMetadata,
  getTcaCompanyService,
  toBooleanOrNull,
  toInt,
  toStringOrNull,
} from "../_shared"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const svc = getTcaCompanyService(req)

  const limit = clamp(toInt(req.query.limit, 50), 1, 200)
  const offset = clamp(toInt(req.query.offset, 0), 0, 10_000)
  const syncStatus = toStringOrNull(req.query.sync_status)
  const orderingEnabled = toBooleanOrNull(req.query.ordering_enabled)

  const filters: Record<string, unknown> = {}
  if (syncStatus) filters["sync_status"] = syncStatus
  if (orderingEnabled !== null) filters["ordering_enabled"] = orderingEnabled

  const rows = await svc.listTcaCompanies(filters, {
    take: limit,
    skip: offset,
    order: { created_at: "DESC" as any },
  } as any)

  const companies = rows.map((c: any) => ({
    id: c.id,
    name: c.name,
    external_company_id: c.external_company_id,
    slug: c.slug,
    ordering_enabled: c.ordering_enabled,
    medusa_sales_channel_id: c.medusa_sales_channel_id,
    medusa_stock_location_id: c.medusa_stock_location_id,
    medusa_default_region_id: c.medusa_default_region_id,
    stripe_connected_account_id: getStripeConnectedAccountIdFromMetadata(
      c.metadata
    ),
    sync_status: c.sync_status,
    last_sync_at: c.last_sync_at,
    last_sync_error: c.last_sync_error,
    created_at: c.created_at,
    updated_at: c.updated_at,
  }))

  return res.status(200).json({
    success: true,
    limit,
    offset,
    companies,
  })
}

