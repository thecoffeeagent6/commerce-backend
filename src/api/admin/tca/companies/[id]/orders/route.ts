import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/utils"
import { getTcaCompanyService } from "../../../_shared"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = (req.params as any)?.id as string | undefined
  if (!id?.trim()) {
    return res.status(400).json({ message: "Missing company id." })
  }

  const svc = getTcaCompanyService(req)
  const company: any = await svc.retrieveTcaCompany(id).catch(() => null)
  if (!company) {
    return res.status(404).json({ message: "Company not found." })
  }

  const salesChannelId = (company.medusa_sales_channel_id as string | null) ?? null
  const orderService: any = req.scope.resolve(Modules.ORDER)

  const take = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)))

  let orders: any[] = []
  const warnings: string[] = []

  if (!salesChannelId) {
    warnings.push("Company missing medusa_sales_channel_id; cannot attribute orders by sales channel.")
  } else {
    orders = await orderService.listOrders(
      { sales_channel_id: salesChannelId },
      { take, order: { created_at: "DESC" } }
    )
  }

  const rows = orders.map((o: any) => ({
    order_id: o.id,
    display_id: o.display_id ?? null,
    status: o.status ?? null,
    payment_status: o.payment_status ?? null,
    fulfillment_status: o.fulfillment_status ?? null,
    sales_channel_id: o.sales_channel_id ?? null,
    metadata_tca_company_id: o.metadata?.tca_company_id ?? null,
    created_at: o.created_at ?? null,
  }))

  return res.status(200).json({
    success: true,
    tca_company_id: id,
    medusa_sales_channel_id: salesChannelId,
    warnings,
    count: rows.length,
    orders: rows,
  })
}

