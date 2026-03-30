import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/utils"
import { getTcaCompanyService, toStringOrNull } from "../../_shared"
import { TCA_COMPANY_MODULE } from "../../../../../modules/tca_company/constants"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const tcaCompanyId = toStringOrNull(req.query.tca_company_id)
  if (!tcaCompanyId) {
    return res.status(400).json({ message: "tca_company_id is required" })
  }

  const svc = getTcaCompanyService(req)
  const company: any = await svc.retrieveTcaCompany(tcaCompanyId).catch(() => null)
  if (!company) {
    return res.status(404).json({ message: "Company not found." })
  }

  const warnings: string[] = []
  const stockLocationId = (company.medusa_stock_location_id as string | null) ?? null
  if (!stockLocationId) {
    warnings.push("Company missing medusa_stock_location_id; inventory mapping cannot be verified.")
  }

  // MVP: show counts of linked products (variants/inventory can be added later without heavy queries).
  const link = req.scope.resolve(ContainerRegistrationKeys.LINK)
  const linked = await link.list(
    { [TCA_COMPANY_MODULE]: { tca_company_id: tcaCompanyId } },
    { asLinkDefinition: true }
  )

  const productIds = (linked as Array<Record<string, any>>)
    .map((e) => e[Modules.PRODUCT]?.product_id as string | undefined)
    .filter((x): x is string => !!x)

  return res.status(200).json({
    success: true,
    tca_company_id: tcaCompanyId,
    stock_location_id: stockLocationId,
    linked_product_count: productIds.length,
    variant_inventory_summary: null,
    warnings,
  })
}

