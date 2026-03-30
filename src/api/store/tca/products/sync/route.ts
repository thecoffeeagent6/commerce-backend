import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import TcaCompanyModuleService from "../../../../../modules/tca_company/service"
import { TCA_COMPANY_MODULE } from "../../../../../modules/tca_company/constants"
import { ensureProductTcaCompanyLink } from "../../../../../modules/tca_company/link-product"

type SyncBody = {
  tca_company_id: string
  tca_menu_item_id: string
  title: string
  type?: string
  price_amount?: number
  currency_code?: string
  inventory_enabled?: boolean
  track_inventory?: boolean
  inventory_managed?: boolean
  inventory_quantity?: number | null
  is_orderable?: boolean
}

type AdminProduct = {
  id: string
  handle?: string
  metadata?: Record<string, unknown>
  variants?: Array<{ id: string }>
}

const REQUEST_TIMEOUT_MS = 20_000
const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 400

export async function POST(req: MedusaRequest<SyncBody>, res: MedusaResponse) {
  const body = req.body
  const publishableKey = process.env.MEDUSA_PUBLISHABLE_KEY ?? ""
  const receivedPk =
    (req.headers["x-publishable-api-key"] as string | undefined) ?? ""

  // If configured, enforce publishable key presence and match.
  if (publishableKey && receivedPk.trim() != publishableKey.trim()) {
    return res.status(401).json({ message: "Invalid publishable API key." })
  }

  if (!body?.tca_company_id || !body?.tca_menu_item_id || !body?.title) {
    return res.status(400).json({
      message: "Missing required fields: tca_company_id, tca_menu_item_id, title.",
    })
  }

  const medusaBaseUrl = process.env.MEDUSA_BASE_URL || process.env.MEDUSA_BACKEND_URL
  const adminToken = process.env.MEDUSA_ADMIN_API_TOKEN || process.env.MEDUSA_API_TOKEN
  if (!medusaBaseUrl || !adminToken) {
    return res.status(500).json({
      message:
        "Missing MEDUSA_BASE_URL/MEDUSA_BACKEND_URL or MEDUSA_ADMIN_API_TOKEN in environment.",
    })
  }

  const normalizedCurrency = (body.currency_code || "usd").toLowerCase()
  const priceMinorUnits = Math.max(0, Math.round((body.price_amount ?? 0) * 100))
  const quantity = Math.max(0, Number(body.inventory_quantity ?? 0))
  const inventoryEnabled = body.inventory_enabled === true
  const trackInventory = body.track_inventory === true
  const isOrderable = body.is_orderable === true
  const handle = buildHandle(body.tca_company_id, body.tca_menu_item_id)
  const title = body.title.trim()

  try {
    const existing = await findByHandle(medusaBaseUrl, adminToken, handle)
    if (existing?.id) {
      const meta = await fetchProductMetadata(medusaBaseUrl, adminToken, existing.id)
      const existingCompany = meta?.tca_company_id
      if (
        existingCompany != null &&
        String(existingCompany).trim() !== body.tca_company_id.trim()
      ) {
        return res.status(409).json({
          message:
            "This product handle is already tied to a different TCA company. Use a distinct menu item or resolve the conflict in Medusa.",
        })
      }
    }

    let productId: string
    let variantId: string

    if (!existing) {
      const created = await createProduct(medusaBaseUrl, adminToken, {
        title,
        handle,
        type: body.type,
        priceMinorUnits,
        normalizedCurrency,
        inventoryEnabled,
        trackInventory,
        quantity,
        isOrderable,
        tcaCompanyId: body.tca_company_id,
        tcaMenuItemId: body.tca_menu_item_id,
      })
      productId = created.productId
      variantId = created.variantId
    } else {
      const updated = await updateProduct(medusaBaseUrl, adminToken, existing, {
        title,
        type: body.type,
        priceMinorUnits,
        normalizedCurrency,
        inventoryEnabled,
        trackInventory,
        quantity,
        isOrderable,
        tcaCompanyId: body.tca_company_id,
        tcaMenuItemId: body.tca_menu_item_id,
      })
      productId = updated.productId
      variantId = updated.variantId
    }

    const tcaSvc = req.scope.resolve(
      TCA_COMPANY_MODULE
    ) as TcaCompanyModuleService

    let tcaRow
    try {
      tcaRow = await tcaSvc.upsertByExternalCompanyId({
        external_company_id: body.tca_company_id,
        name: title,
        sync_status: "ok",
        last_sync_at: new Date(),
        last_sync_error: null,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return res.status(500).json({
        message: "Failed to upsert TCA company record in Medusa.",
        error: message,
      })
    }

    try {
      await ensureProductTcaCompanyLink(req.scope, productId, tcaRow.id)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await tcaSvc.recordSyncError(body.tca_company_id, `link_failed: ${message}`)
      return res.status(502).json({
        message:
          "Product was created/updated in Medusa but linking to TCA company failed. Retry sync to repair.",
        error: message,
        productId,
        variantId,
      })
    }

    return res.status(200).json({
      success: true,
      productId,
      variantId,
      tca_company_record_id: tcaRow.id,
      mode: existing ? "updated" : "created",
      inventory: {
        inventory_enabled: inventoryEnabled,
        track_inventory: trackInventory,
        inventory_quantity: quantity,
        is_orderable: isOrderable,
      },
    })
  } catch (e) {
    return res.status(502).json({
      message: "Failed syncing product to Medusa Cloud.",
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

function buildHandle(companyId: string, menuItemId: string) {
  const normalizedCompany = companyId.toLowerCase().replace(/[^a-z0-9_-]/g, "-")
  const normalizedItem = menuItemId.toLowerCase().replace(/[^a-z0-9_-]/g, "-")
  return `tca-${normalizedCompany}-${normalizedItem}`.slice(0, 180)
}

function mapInventoryToVariantFlags(inventoryEnabled: boolean, trackInventory: boolean) {
  // TCA mapping rule:
  // - inventory_enabled -> manage_inventory
  // - track_inventory=false -> allow backorders
  if (!inventoryEnabled) {
    return { manage_inventory: false, allow_backorder: true }
  }
  if (inventoryEnabled && !trackInventory) {
    return { manage_inventory: false, allow_backorder: true }
  }
  return { manage_inventory: true, allow_backorder: false }
}

async function fetchProductMetadata(
  baseUrl: string,
  token: string,
  productId: string
): Promise<Record<string, unknown> | undefined> {
  const query = new URLSearchParams({
    fields: "id,metadata",
  }).toString()
  const json = await requestWithRetry<{
    product?: { metadata?: Record<string, unknown> }
  }>({
    method: "GET",
    url: `${baseUrl.replace(/\/$/, "")}/admin/products/${productId}?${query}`,
    token,
  })
  return json.product?.metadata
}

async function findByHandle(
  baseUrl: string,
  token: string,
  handle: string
): Promise<AdminProduct | null> {
  const query = new URLSearchParams({ handle, limit: "1" }).toString()
  const json = await requestWithRetry<{
    products?: Array<AdminProduct>
  }>({
    method: "GET",
    url: `${baseUrl.replace(/\/$/, "")}/admin/products?${query}`,
    token,
  })
  const products = json.products || []
  return products.length > 0 ? products[0] : null
}

async function createProduct(
  baseUrl: string,
  token: string,
  input: {
    title: string
    handle: string
    type?: string
    priceMinorUnits: number
    normalizedCurrency: string
    inventoryEnabled: boolean
    trackInventory: boolean
    quantity: number
    isOrderable: boolean
    tcaCompanyId: string
    tcaMenuItemId: string
  }
): Promise<{ productId: string; variantId: string }> {
  const inventoryFlags = mapInventoryToVariantFlags(
    input.inventoryEnabled,
    input.trackInventory
  )
  const payload: Record<string, unknown> = {
    title: input.title,
    handle: input.handle,
    status: input.isOrderable ? "published" : "draft",
    metadata: {
      tca_company_id: input.tcaCompanyId,
      tca_menu_item_id: input.tcaMenuItemId,
      tca_type: input.type ?? "menu_item",
    },
    options: [{ title: "Default" }],
    variants: [
      {
        title: "Default",
        options: { Default: "Default" },
        manage_inventory: inventoryFlags.manage_inventory,
        allow_backorder: inventoryFlags.allow_backorder,
        inventory_quantity:
          input.inventoryEnabled && input.trackInventory ? input.quantity : undefined,
        prices: [
          {
            amount: input.priceMinorUnits,
            currency_code: input.normalizedCurrency,
          },
        ],
      },
    ],
  }

  const json = await requestWithRetry<{
    product?: AdminProduct
  }>({
    method: "POST",
    url: `${baseUrl.replace(/\/$/, "")}/admin/products`,
    token,
    body: payload,
  })
  const productId = json.product?.id
  const variantId = json.product?.variants?.[0]?.id
  if (!productId || !variantId) {
    throw new Error("Product created but product/variant ID missing in response.")
  }
  return { productId, variantId }
}

async function updateProduct(
  baseUrl: string,
  token: string,
  existing: AdminProduct,
  input: {
    title: string
    type?: string
    priceMinorUnits: number
    normalizedCurrency: string
    inventoryEnabled: boolean
    trackInventory: boolean
    quantity: number
    isOrderable: boolean
    tcaCompanyId: string
    tcaMenuItemId: string
  }
): Promise<{ productId: string; variantId: string }> {
  const variantId = existing.variants?.[0]?.id
  if (!existing.id || !variantId) {
    throw new Error("Existing product missing variant to update.")
  }

  // Update product shell (title/status/metadata)
  await requestWithRetry({
    method: "POST",
    url: `${baseUrl.replace(/\/$/, "")}/admin/products/${existing.id}`,
    token,
    body: {
      title: input.title,
      status: input.isOrderable ? "published" : "draft",
      metadata: {
        tca_company_id: input.tcaCompanyId,
        tca_menu_item_id: input.tcaMenuItemId,
        tca_type: input.type ?? "menu_item",
      },
    },
  })

  const inventoryFlags = mapInventoryToVariantFlags(
    input.inventoryEnabled,
    input.trackInventory
  )

  // Update variant-level availability/inventory/price.
  await requestWithRetry({
    method: "POST",
    url: `${baseUrl.replace(/\/$/, "")}/admin/products/${existing.id}/variants/${variantId}`,
    token,
    body: {
      manage_inventory: inventoryFlags.manage_inventory,
      allow_backorder: inventoryFlags.allow_backorder,
      inventory_quantity:
        input.inventoryEnabled && input.trackInventory ? input.quantity : undefined,
      prices: [
        {
          amount: input.priceMinorUnits,
          currency_code: input.normalizedCurrency,
        },
      ],
    },
  })

  return { productId: existing.id, variantId }
}

async function requestWithRetry<T = unknown>(args: {
  method: "GET" | "POST"
  url: string
  token: string
  body?: Record<string, unknown>
}): Promise<T> {
  let attempt = 0
  let backoffMs = INITIAL_BACKOFF_MS
  let lastError: Error | null = null

  while (attempt < MAX_RETRIES) {
    attempt += 1
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      const response = await fetch(args.url, {
        method: args.method,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${args.token}`,
        },
        body: args.body ? JSON.stringify(args.body) : undefined,
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (response.ok) {
        const text = await response.text()
        return (text ? JSON.parse(text) : {}) as T
      }

      const bodyText = await response.text()
      const isRetryable = response.status >= 500 || response.status === 429
      const error = new Error(
        `Medusa request failed (${response.status}): ${bodyText || "empty response"}`
      )
      lastError = error
      if (!isRetryable || attempt >= MAX_RETRIES) {
        throw error
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      if (attempt >= MAX_RETRIES) {
        break
      }
    }

    await sleep(backoffMs)
    backoffMs *= 2
  }

  throw lastError ?? new Error("Unknown Medusa request failure.")
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
