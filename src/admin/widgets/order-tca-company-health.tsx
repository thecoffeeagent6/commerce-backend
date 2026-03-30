import type { AdminOrder, DetailWidgetProps } from "@medusajs/types"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"

import { adminGetJson } from "../lib/tca-admin-client"

type OrderHealth = {
  success: boolean
  order_id: string
  sales_channel_id: string | null
  metadata_tca_company_id: string | null
  resolved_by: "sales_channel" | "metadata" | "unknown"
  resolved_company: null | {
    id: string
    name: string
    external_company_id: string
    slug: string
    medusa_sales_channel_id: string | null
  }
  warnings: string[]
}

const OrderTcaCompanyHealth = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<OrderHealth | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const h = await adminGetJson<OrderHealth>(
          `/admin/tca/orders/${data.id}/health`
        )
        if (!mounted) return
        setHealth(h)
      } catch (e) {
        if (!mounted) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!mounted) return
        setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [data.id])

  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 10,
          padding: 12,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>
          TCA Company Attribution (Health)
        </div>

        {loading ? <div>Loading…</div> : null}
        {error ? <div>Error: {error}</div> : null}

        {!loading && !error && health ? (
          <>
            <div>resolved_by: {health.resolved_by}</div>
            <div>sales_channel_id: {health.sales_channel_id ?? "—"}</div>
            <div>
              metadata.tca_company_id: {health.metadata_tca_company_id ?? "—"}
            </div>
            <div>
              resolved_company:{" "}
              {health.resolved_company
                ? `${health.resolved_company.name} (${health.resolved_company.external_company_id})`
                : "—"}
            </div>
            {health.warnings?.length ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 800 }}>Warnings</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {health.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default OrderTcaCompanyHealth

