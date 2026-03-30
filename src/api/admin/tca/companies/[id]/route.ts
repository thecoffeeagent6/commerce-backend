import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  getStripeConnectedAccountIdFromMetadata,
  getTcaCompanyService,
} from "../../_shared"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = (req.params as any)?.id as string | undefined
  if (!id?.trim()) {
    return res.status(400).json({ message: "Missing company id." })
  }

  const svc = getTcaCompanyService(req)
  const row = await svc.retrieveTcaCompany(id).catch(() => null)
  if (!row) {
    return res.status(404).json({ message: "Company not found." })
  }

  const company: any = row
  return res.status(200).json({
    success: true,
    company: {
      ...company,
      stripe_connected_account_id: getStripeConnectedAccountIdFromMetadata(
        company.metadata
      ),
    },
  })
}

