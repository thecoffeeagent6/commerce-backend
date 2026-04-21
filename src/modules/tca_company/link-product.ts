import type { MedusaContainer } from "@medusajs/types"
import {
  ContainerRegistrationKeys,
  Modules,
  remoteQueryObjectFromString,
} from "@medusajs/framework/utils"
import { TCA_COMPANY_MODULE } from "./constants"

export type MedusaScope = MedusaContainer

async function fetchProductTcaCompanyLinkRow(
  container: MedusaScope,
  productId: string,
): Promise<{ product_id: string; tca_company_id: string } | null> {
  const remoteQuery = container.resolve(ContainerRegistrationKeys.REMOTE_QUERY)
  const queryObject = remoteQueryObjectFromString({
    entryPoint: "product_tca_company",
    variables: { filters: { product_id: productId } },
    fields: ["product_id", "tca_company_id"],
  })
  const rows = await remoteQuery(queryObject)
  const row = Array.isArray(rows) ? rows[0] : null
  if (
    row &&
    typeof row.tca_company_id === "string" &&
    row.tca_company_id.length > 0
  ) {
    return {
      product_id: String(row.product_id ?? productId),
      tca_company_id: row.tca_company_id,
    }
  }
  return null
}

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
  const existing = await fetchProductTcaCompanyLinkRow(container, productId)
  const currentLinkedId = existing?.tca_company_id

  if (currentLinkedId === tcaCompanyId) {
    return
  }
  if (currentLinkedId) {
    await link.dismiss({
      [Modules.PRODUCT]: { product_id: productId },
      [TCA_COMPANY_MODULE]: { tca_company_id: currentLinkedId },
    })
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
  const row = await fetchProductTcaCompanyLinkRow(container, productId)
  return row?.tca_company_id ?? null
}
