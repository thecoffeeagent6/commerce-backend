import type { AdminProduct, DetailWidgetProps } from "@medusajs/types"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"

import { adminGetJson } from "../lib/tca-admin-client"

type ProductHealth = {
  success: boolean
  product_id: string
  tca_company_id: string | null
  company: null | {
    id: string
    name: string
    external_company_id: string
    slug: string
    medusa_sales_channel_id: string | null
    medusa_stock_location_id: string | null
    sync_status: string | null
    last_sync_at: string | null
    last_sync_error: string | null
  }
  warnings: string[]
}

const ProductTcaCompanyHealth = ({ data }: DetailWidgetProps<AdminProduct>) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<ProductHealth | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const h = await adminGetJson<ProductHealth>(
          `/admin/tca/products/${data.id}/health`
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
          TCA Company Linkage (Health)
        </div>

        {loading ? <div>Loading…</div> : null}
        {error ? <div>Error: {error}</div> : null}

        {!loading && !error && health ? (
          <>
            <div>tca_company_id: {health.tca_company_id ?? "—"}</div>
            <div>
              external_company_id: {health.company?.external_company_id ?? "—"}
            </div>
            <div>company_slug: {health.company?.slug ?? "—"}</div>
            <div>sync_status: {health.company?.sync_status ?? "—"}</div>
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
  zone: "product.details.after",
})

export default ProductTcaCompanyHealth

