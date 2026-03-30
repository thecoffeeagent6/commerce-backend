import { MedusaService } from "@medusajs/framework/utils"
import TcaCompany from "./models/tca_company"

export type UpsertTcaCompanyInput = {
  external_company_id: string
  name?: string
  slug?: string
  is_active?: boolean
  ordering_enabled?: boolean
  supports_pickup?: boolean
  supports_drive_thru?: boolean
  supports_dine_in?: boolean
  medusa_sales_channel_id?: string | null
  medusa_stock_location_id?: string | null
  medusa_default_region_id?: string | null
  sync_status?: string
  last_sync_at?: Date | null
  last_sync_error?: string | null
  metadata?: Record<string, unknown> | null
}

class TcaCompanyModuleService extends MedusaService({
  TcaCompany,
}) {
  /**
   * Create or update by Firestore/TCA company id. Conflicting non-empty Medusa id fields on an
   * existing row: new values win (last-write) when provided; omit to preserve stored values.
   */
  async upsertByExternalCompanyId(input: UpsertTcaCompanyInput) {
    const externalId = input.external_company_id?.trim()
    if (!externalId) {
      throw new Error("external_company_id is required")
    }

    const existingList = await this.listTcaCompanies({
      external_company_id: externalId,
    })
    const existing = existingList[0]

    const mergeMedusaId = (
    current: string | null | undefined,
    incoming: string | null | undefined
  ): string | null | undefined => {
    if (incoming === undefined) {
      return current
    }
    const inc = incoming?.trim() || null
    const cur = current?.trim() || null
    if (cur && inc && cur !== inc) {
      // Last-write-wins for provisioning corrections
      return inc
    }
    return inc ?? cur
  }

    const payload = {
      external_company_id: externalId,
      name: input.name?.trim() ?? existing?.name ?? "",
      slug:
        input.slug?.trim() ||
        existing?.slug ||
        externalId.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 120),
      is_active: input.is_active ?? existing?.is_active ?? true,
      ordering_enabled: input.ordering_enabled ?? existing?.ordering_enabled ?? false,
      supports_pickup: input.supports_pickup ?? existing?.supports_pickup ?? true,
      supports_drive_thru:
        input.supports_drive_thru ?? existing?.supports_drive_thru ?? true,
      supports_dine_in: input.supports_dine_in ?? existing?.supports_dine_in ?? false,
      medusa_sales_channel_id: mergeMedusaId(
        existing?.medusa_sales_channel_id,
        input.medusa_sales_channel_id
      ) as string | null | undefined,
      medusa_stock_location_id: mergeMedusaId(
        existing?.medusa_stock_location_id,
        input.medusa_stock_location_id
      ) as string | null | undefined,
      medusa_default_region_id: mergeMedusaId(
        existing?.medusa_default_region_id,
        input.medusa_default_region_id
      ) as string | null | undefined,
      sync_status: input.sync_status ?? existing?.sync_status ?? "not_synced",
      last_sync_at: input.last_sync_at ?? existing?.last_sync_at,
      last_sync_error: input.last_sync_error ?? existing?.last_sync_error,
      metadata:
        input.metadata !== undefined ? input.metadata : existing?.metadata ?? null,
    }

    if (existing) {
      const updated = await this.updateTcaCompanies([
        {
          id: existing.id,
          ...payload,
        },
      ])
      return updated[0]
    }

    const created = await this.createTcaCompanies([payload])
    return created[0]
  }

  async retrieveByExternalCompanyId(externalCompanyId: string) {
    const rows = await this.listTcaCompanies({
      external_company_id: externalCompanyId,
    })
    return rows[0] ?? null
  }

  async recordSyncError(externalCompanyId: string, message: string) {
    const row = await this.retrieveByExternalCompanyId(externalCompanyId)
    if (!row) {
      return null
    }
    const updated = await this.updateTcaCompanies([
      {
        id: row.id,
        sync_status: "error",
        last_sync_error: message,
        last_sync_at: new Date(),
      },
    ])
    return updated[0]
  }
}

export default TcaCompanyModuleService
