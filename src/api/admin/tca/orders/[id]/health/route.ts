import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/utils"
import { getTcaCompanyService } from "../../../_shared"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const orderId = (req.params as any)?.id as string | undefined
  if (!orderId?.trim()) {
    return res.status(400).json({ message: "Missing order id." })
  }

  const orderService: any = req.scope.resolve(Modules.ORDER)
  const order = await orderService.retrieveOrder(orderId).catch(() => null)
  if (!order) {
    return res.status(404).json({ message: "Order not found." })
  }

  const svc = getTcaCompanyService(req)

  const salesChannelId = (order.sales_channel_id as string | null) ?? null
  const metaCompanyId =
    (order.metadata?.tca_company_id as string | undefined) ?? null

  const warnings: string[] = []
  let resolvedBy: "sales_channel" | "metadata" | "unknown" = "unknown"
  let resolvedCompany: any = null

  if (salesChannelId) {
    const matches = await svc.listTcaCompanies({
      medusa_sales_channel_id: salesChannelId,
    })
    if (matches.length === 1) {
      resolvedCompany = matches[0]
      resolvedBy = "sales_channel"
    } else if (matches.length > 1) {
      warnings.push(
        "Multiple TCA companies match this sales_channel_id; attribution is ambiguous."
      )
    } else {
      warnings.push(
        "No TCA company matches this sales_channel_id; check provisioning."
      )
    }
  } else {
    warnings.push("Order has no sales_channel_id; cannot attribute by channel.")
  }

  if (!resolvedCompany && metaCompanyId) {
    const metaMatch = await svc.retrieveByExternalCompanyId(metaCompanyId)
    if (metaMatch) {
      resolvedCompany = metaMatch
      resolvedBy = "metadata"
    } else {
      warnings.push("Order metadata.tca_company_id did not match a known company.")
    }
  }

  if (resolvedBy === "sales_channel" && metaCompanyId) {
    const external = (resolvedCompany?.external_company_id as string | undefined) ?? null
    if (external && external !== metaCompanyId) {
      warnings.push(
        "Order metadata.tca_company_id conflicts with sales-channel-derived company."
      )
    }
  }

  return res.status(200).json({
    success: true,
    order_id: orderId,
    sales_channel_id: salesChannelId,
    metadata_tca_company_id: metaCompanyId,
    resolved_by: resolvedBy,
    resolved_company: resolvedCompany
      ? {
          id: resolvedCompany.id,
          name: resolvedCompany.name,
          external_company_id: resolvedCompany.external_company_id,
          slug: resolvedCompany.slug,
          medusa_sales_channel_id: resolvedCompany.medusa_sales_channel_id ?? null,
        }
      : null,
    warnings,
  })
}

