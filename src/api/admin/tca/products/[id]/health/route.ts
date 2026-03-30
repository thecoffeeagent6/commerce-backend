import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getTcaCompanyService } from "../../../_shared"
import { getTcaCompanyIdForProduct } from "../../../../../../modules/tca_company/link-product"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productId = (req.params as any)?.id as string | undefined
  if (!productId?.trim()) {
    return res.status(400).json({ message: "Missing product id." })
  }

  const tcaCompanyId = await getTcaCompanyIdForProduct(req.scope as any, productId)
  const svc = getTcaCompanyService(req)
  const company = tcaCompanyId ? await svc.retrieveTcaCompany(tcaCompanyId).catch(() => null) : null

  return res.status(200).json({
    success: true,
    product_id: productId,
    tca_company_id: tcaCompanyId,
    company: company
      ? {
          id: (company as any).id,
          name: (company as any).name,
          external_company_id: (company as any).external_company_id,
          slug: (company as any).slug,
          medusa_sales_channel_id: (company as any).medusa_sales_channel_id ?? null,
          medusa_stock_location_id: (company as any).medusa_stock_location_id ?? null,
          sync_status: (company as any).sync_status ?? null,
          last_sync_at: (company as any).last_sync_at ?? null,
          last_sync_error: (company as any).last_sync_error ?? null,
        }
      : null,
    warnings: tcaCompanyId ? [] : ["Product is not linked to a TCA company."],
  })
}

