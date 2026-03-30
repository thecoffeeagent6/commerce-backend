import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { adminGetJson } from "../../../lib/tca-admin-client"

type CompanyRow = {
  id: string
  name: string
  external_company_id: string
  ordering_enabled: boolean
  medusa_sales_channel_id: string | null
  medusa_stock_location_id: string | null
  stripe_connected_account_id: string | null
  sync_status: string
  last_sync_at: string | null
}

type CompaniesResponse = {
  success: boolean
  companies: CompanyRow[]
}

const CompaniesPage = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<CompanyRow[]>([])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await adminGetJson<CompaniesResponse>(
          "/admin/tca/companies?limit=200&offset=0"
        )
        if (!mounted) return
        setRows(data.companies ?? [])
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
  }, [])

  const content = useMemo(() => {
    if (loading) return <div>Loading companies…</div>
    if (error) return <div>Error: {error}</div>
    if (!rows.length) return <div>No companies found.</div>

    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {[
                "name",
                "external_company_id",
                "ordering_enabled",
                "sales_channel_id",
                "stock_location_id",
                "stripe_connected_account_id",
                "sync_status",
                "last_sync_at",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "10px 8px",
                    borderBottom: "1px solid rgba(0,0,0,0.08)",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => navigate(`/commerce-health/companies/${r.id}`)}
                style={{ cursor: "pointer" }}
              >
                <td style={{ padding: "10px 8px" }}>{r.name || "(unnamed)"}</td>
                <td style={{ padding: "10px 8px" }}>{r.external_company_id}</td>
                <td style={{ padding: "10px 8px" }}>
                  {r.ordering_enabled ? "yes" : "no"}
                </td>
                <td style={{ padding: "10px 8px" }}>
                  {r.medusa_sales_channel_id ?? "—"}
                </td>
                <td style={{ padding: "10px 8px" }}>
                  {r.medusa_stock_location_id ?? "—"}
                </td>
                <td style={{ padding: "10px 8px" }}>
                  {r.stripe_connected_account_id ?? "—"}
                </td>
                <td style={{ padding: "10px 8px" }}>{r.sync_status}</td>
                <td style={{ padding: "10px 8px" }}>{r.last_sync_at ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }, [error, loading, navigate, rows])

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ margin: 0, fontSize: 18 }}>Commerce Health: Companies</h1>
      <p style={{ marginTop: 6, color: "rgba(0,0,0,0.6)" }}>
        Internal verification view for TCA ↔ Medusa linkage.
      </p>
      {content}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Commerce Health",
  rank: 90,
})

export default CompaniesPage

