import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/utils"
import { getTcaCompanyService } from "../../../_shared"
import { TCA_COMPANY_MODULE } from "../../../../../../modules/tca_company/constants"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = (req.params as any)?.id as string | undefined
  if (!id?.trim()) {
    return res.status(400).json({ message: "Missing company id." })
  }

  const svc = getTcaCompanyService(req)
  const company = await svc.retrieveTcaCompany(id).catch(() => null)
  if (!company) {
    return res.status(404).json({ message: "Company not found." })
  }

  const link = req.scope.resolve(ContainerRegistrationKeys.LINK)
  const linked = await link.list(
    {
      [TCA_COMPANY_MODULE]: { tca_company_id: id },
    },
    { asLinkDefinition: true }
  )

  const productIds = (linked as Array<Record<string, any>>)
    .map((e) => e[Modules.PRODUCT]?.product_id as string | undefined)
    .filter((x): x is string => !!x)

  const productService: any = req.scope.resolve(Modules.PRODUCT)
  const products: any[] = productIds.length
    ? await productService.listProducts(
        { id: productIds },
        { take: Math.min(200, productIds.length) }
      )
    : []

  const byId = new Map(products.map((p: any) => [p.id, p]))
  const rows = productIds.map((pid) => {
    const p = byId.get(pid)
    return {
      product_id: pid,
      title: p?.title ?? null,
      handle: p?.handle ?? null,
      status: p?.status ?? null,
      is_linked: true,
    }
  })

  return res.status(200).json({
    success: true,
    tca_company_id: id,
    count: rows.length,
    products: rows,
  })
}

