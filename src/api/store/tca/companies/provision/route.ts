import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import TcaCompanyModuleService from "../../../../../modules/tca_company/service"
import { TCA_COMPANY_MODULE } from "../../../../../modules/tca_company/constants"

type ProvisionBody = {
  external_company_id: string
  name?: string
  slug?: string
  ordering_enabled?: boolean
  supports_pickup?: boolean
  supports_drive_thru?: boolean
  supports_dine_in?: boolean
  medusa_sales_channel_id?: string | null
  medusa_stock_location_id?: string | null
  medusa_default_region_id?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Upsert `TcaCompany` only (no product). Use from TCA/Firestore when provisioning commerce IDs
 * before the first menu sync. Same publishable key gate as product sync.
 */
export async function POST(
  req: MedusaRequest<ProvisionBody>,
  res: MedusaResponse
) {
  const body = req.body
  const publishableKey = process.env.MEDUSA_PUBLISHABLE_KEY ?? ""
  const receivedPk =
    (req.headers["x-publishable-api-key"] as string | undefined) ?? ""

  if (publishableKey && receivedPk.trim() != publishableKey.trim()) {
    return res.status(401).json({ message: "Invalid publishable API key." })
  }

  if (!body?.external_company_id?.trim()) {
    return res.status(400).json({ message: "external_company_id is required." })
  }

  try {
    const tcaSvc = req.scope.resolve(
      TCA_COMPANY_MODULE
    ) as TcaCompanyModuleService
    const row = await tcaSvc.upsertByExternalCompanyId({
      external_company_id: body.external_company_id.trim(),
      name: body.name,
      slug: body.slug,
      ordering_enabled: body.ordering_enabled,
      supports_pickup: body.supports_pickup,
      supports_drive_thru: body.supports_drive_thru,
      supports_dine_in: body.supports_dine_in,
      medusa_sales_channel_id: body.medusa_sales_channel_id,
      medusa_stock_location_id: body.medusa_stock_location_id,
      medusa_default_region_id: body.medusa_default_region_id,
      metadata: body.metadata ?? undefined,
      sync_status: "ok",
      last_sync_at: new Date(),
      last_sync_error: null,
    })
    return res.status(200).json({
      success: true,
      tca_company: row,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return res.status(500).json({
      message: "Failed to provision TCA company in Medusa.",
      error: message,
    })
  }
}
