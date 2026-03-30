import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import TcaCompanyModule from "../modules/tca_company"

/**
 * Many Medusa products belong to one TCA company (N:1).
 * `isList: true` on the product side: one company has many products; each product links to one company.
 */
export default defineLink(
  {
    linkable: ProductModule.linkable.product,
    isList: true,
  },
  TcaCompanyModule.linkable.tcaCompany
)
