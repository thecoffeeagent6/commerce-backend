import { MedusaRequest } from "@medusajs/framework/http"
import TcaCompanyModuleService from "../../../modules/tca_company/service"
import { TCA_COMPANY_MODULE } from "../../../modules/tca_company/constants"

export function toStringOrNull(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim()
  return s.length ? s : null
}

export function toBooleanOrNull(v: unknown): boolean | null {
  if (v === true || v === "true") return true
  if (v === false || v === "false") return false
  return null
}

export function toInt(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.trunc(n)
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export function getTcaCompanyService(req: MedusaRequest) {
  return req.scope.resolve(TCA_COMPANY_MODULE) as TcaCompanyModuleService
}

export function getStripeConnectedAccountIdFromMetadata(
  metadata: unknown
): string | null {
  if (!metadata || typeof metadata !== "object") return null
  const record = metadata as Record<string, unknown>
  return toStringOrNull(record["stripe_connected_account_id"])
}

