import type { MedusaContainer } from "@medusajs/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/utils"
import { TCA_COMPANY_MODULE } from "./constants"

export type MedusaScope = MedusaContainer

/**
 * Ensures the product is linked to exactly one TcaCompany (internal Medusa id).
 * If it was linked to a different TcaCompany, the old link is dismissed first.
 */
export async function ensureProductTcaCompanyLink(
  container: MedusaScope,
  productId: string,
  tcaCompanyId: string
): Promise<void> {
  const link = container.resolve(ContainerRegistrationKeys.LINK)

  const existing = await link.list(
    {
      [Modules.PRODUCT]: {
        product_id: productId,
      },
    },
    { asLinkDefinition: true }
  )

  for (const entry of existing as Array<Record<string, Record<string, string>>>) {
    const tcaSide = entry[TCA_COMPANY_MODULE]
    const currentLinkedId = tcaSide?.tca_company_id
    if (currentLinkedId === tcaCompanyId) {
      return
    }
    if (currentLinkedId) {
      await link.dismiss(entry)
    }
  }

  await link.create({
    [Modules.PRODUCT]: { product_id: productId },
    [TCA_COMPANY_MODULE]: { tca_company_id: tcaCompanyId },
  })
}

/** Resolve internal `tca_company.id` linked to a product, if any. */
export async function getTcaCompanyIdForProduct(
  container: MedusaScope,
  productId: string
): Promise<string | null> {
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const rows = await link.list(
    {
      [Modules.PRODUCT]: { product_id: productId },
    },
    { asLinkDefinition: true }
  )
  for (const entry of rows as Array<Record<string, Record<string, string>>>) {
    const id = entry[TCA_COMPANY_MODULE]?.tca_company_id
    if (id) {
      return id
    }
  }
  return null
}
