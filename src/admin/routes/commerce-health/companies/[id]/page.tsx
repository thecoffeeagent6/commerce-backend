import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"

import { adminGetJson } from "../../../../lib/tca-admin-client"

type Company = {
  id: string
  name: string
  external_company_id: string
  slug: string
  ordering_enabled: boolean
  medusa_sales_channel_id: string | null
  medusa_stock_location_id: string | null
  medusa_default_region_id: string | null
  stripe_connected_account_id: string | null
  sync_status: string
  last_sync_at: string | null
  last_sync_error: string | null
}

type CompanyResponse = { success: boolean; company: Company }
type ProductsResponse = {
  success: boolean
  count: number
  products: Array<{
    product_id: string
    title: string | null
    handle: string | null
    status: string | null
    is_linked: boolean
  }>
}
type OrdersResponse = {
  success: boolean
  warnings: string[]
  count: number
  orders: Array<{
    order_id: string
    display_id: number | null
    status: string | null
    sales_channel_id: string | null
    metadata_tca_company_id: string | null
    created_at: string | null
  }>
}
type InventoryResponse = {
  success: boolean
  stock_location_id: string | null
  linked_product_count: number
  warnings: string[]
}

const Card = (props: { title: string; children: any }) => {
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 10,
        padding: 12,
        marginTop: 12,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{props.title}</div>
      {props.children}
    </div>
  )
}

const Badge = (props: { label: string }) => (
  <span
    style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 999,
      background: "rgba(0,0,0,0.06)",
      fontSize: 12,
      fontWeight: 700,
    }}
  >
    {props.label}
  </span>
)

const CompanyDetailPage = () => {
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [products, setProducts] = useState<ProductsResponse | null>(null)
  const [orders, setOrders] = useState<OrdersResponse | null>(null)
  const [inventory, setInventory] = useState<InventoryResponse | null>(null)

  useEffect(() => {
    if (!id) return
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const [c, p, o, inv] = await Promise.all([
          adminGetJson<CompanyResponse>(`/admin/tca/companies/${id}`),
          adminGetJson<ProductsResponse>(`/admin/tca/companies/${id}/products`),
          adminGetJson<OrdersResponse>(`/admin/tca/companies/${id}/orders?limit=20`),
          adminGetJson<InventoryResponse>(
            `/admin/tca/inventory/summary?tca_company_id=${id}`
          ),
        ])
        if (!mounted) return
        setCompany(c.company)
        setProducts(p)
        setOrders(o)
        setInventory(inv)
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
  }, [id])

  const warnings = useMemo(() => {
    const w: string[] = []
    if (!company) return w
    if (!company.medusa_sales_channel_id) w.push("Missing sales channel mapping.")
    if (!company.medusa_stock_location_id) w.push("Missing stock location mapping.")
    if (!company.medusa_default_region_id) w.push("Missing default region mapping.")
    if (!company.stripe_connected_account_id) w.push("Missing Stripe connected account id.")
    if (company.sync_status === "error" && company.last_sync_error) {
      w.push(`Sync error: ${company.last_sync_error}`)
    }
    for (const x of orders?.warnings ?? []) w.push(x)
    for (const x of inventory?.warnings ?? []) w.push(x)
    return w
  }, [company, inventory?.warnings, orders?.warnings])

  if (loading) return <div style={{ padding: 16 }}>Loading company…</div>
  if (error) return <div style={{ padding: 16 }}>Error: {error}</div>
  if (!company) return <div style={{ padding: 16 }}>Company not found.</div>

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>
          {company.name || "(unnamed)"} <Badge label={company.sync_status} />
        </h1>
        <div style={{ marginLeft: "auto" }}>
          <Link to="/commerce-health/companies">Back to companies</Link>
        </div>
      </div>

      {warnings.length ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 10,
            background: "rgba(255, 193, 7, 0.18)",
            border: "1px solid rgba(255, 193, 7, 0.35)",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Warnings</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card title="Company">
        <div>id: {company.id}</div>
        <div>external_company_id: {company.external_company_id}</div>
        <div>slug: {company.slug || "—"}</div>
        <div>ordering_enabled: {company.ordering_enabled ? "yes" : "no"}</div>
      </Card>

      <Card title="Medusa linkage">
        <div>sales_channel_id: {company.medusa_sales_channel_id ?? "—"}</div>
        <div>stock_location_id: {company.medusa_stock_location_id ?? "—"}</div>
        <div>default_region_id: {company.medusa_default_region_id ?? "—"}</div>
      </Card>

      <Card title="Stripe linkage (visibility only)">
        <div>
          stripe_connected_account_id:{" "}
          {company.stripe_connected_account_id ?? "—"}
        </div>
      </Card>

      <Card title="Linked products">
        <div style={{ marginBottom: 8 }}>
          Count: {products?.count ?? 0}
        </div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {(products?.products ?? []).slice(0, 8).map((p) => (
            <li key={p.product_id}>
              {p.title ?? p.product_id} {p.status ? `(${p.status})` : ""}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Recent orders">
        <div style={{ marginBottom: 8 }}>
          Count: {orders?.count ?? 0}
        </div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {(orders?.orders ?? []).slice(0, 8).map((o) => (
            <li key={o.order_id}>
              {o.display_id != null ? `#${o.display_id}` : o.order_id}{" "}
              {o.status ? `(${o.status})` : ""}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Inventory summary (MVP)">
        <div>stock_location_id: {inventory?.stock_location_id ?? "—"}</div>
        <div>linked_product_count: {inventory?.linked_product_count ?? 0}</div>
      </Card>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Company detail",
})

export default CompanyDetailPage

