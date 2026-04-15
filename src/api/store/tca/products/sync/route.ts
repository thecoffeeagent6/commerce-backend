import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  updateProductsWorkflow,
  createCollectionsWorkflow,
} from "@medusajs/medusa/core-flows"
import TcaCompanyModuleService from "../../../../../modules/tca_company/service"
import { TCA_COMPANY_MODULE } from "../../../../../modules/tca_company/constants"
import { ensureProductTcaCompanyLink } from "../../../../../modules/tca_company/link-product"

type SyncBody = {
  tca_company_id: string
  tca_menu_item_id: string
  title: string
  description?: string | null
  image_url?: string | null
  type?: string
  company_name?: string | null
  category_name?: string | null
  price_amount?: number
  currency_code?: string
  inventory_enabled?: boolean
  track_inventory?: boolean
  inventory_managed?: boolean
  inventory_quantity?: number | null
  is_orderable?: boolean
  is_vegetarian?: boolean
  is_vegan?: boolean
  is_gluten_free?: boolean
  allergens?: string[] | null
  ingredients?: string[] | null
}

export async function POST(req: MedusaRequest<SyncBody>, res: MedusaResponse) {
  const body = req.body

  const imageUrl = body?.image_url?.trim() || undefined
  const description = body?.description?.trim() || ""
  const companyName = body?.company_name?.trim() || undefined
  const categoryName = body?.category_name?.trim() || undefined

  console.log("[tca-sync] POST /store/tca/products/sync", {
    tca_company_id: body?.tca_company_id ?? "(missing)",
    title: body?.title ?? "(missing)",
    company_name: companyName ?? "(not provided)",
    category_name: categoryName ?? "(not provided)",
    image_url: imageUrl ?? "(empty)",
    description: description ? `${description.length} chars` : "(empty)",
  })

  const publishableKey = process.env.MEDUSA_PUBLISHABLE_KEY ?? ""
  const receivedPk =
    (req.headers["x-publishable-api-key"] as string | undefined) ?? ""

  if (publishableKey && receivedPk.trim() != publishableKey.trim()) {
    return res.status(401).json({ message: "Invalid publishable API key." })
  }

  if (!body?.tca_company_id || !body?.tca_menu_item_id || !body?.title) {
    return res.status(400).json({
      message: "Missing required fields: tca_company_id, tca_menu_item_id, title.",
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
    const productService: any = req.scope.resolve(Modules.PRODUCT)

    // ── Find or create a Medusa collection for this company ──
    let collectionId: string | undefined
    if (companyName) {
      try {
        collectionId = await findOrCreateCollection(
          req.scope, productService, companyName, body.tca_company_id
        )
        console.log("[tca-sync] Collection resolved", { collectionId, companyName })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn("[tca-sync] Collection find/create failed (non-fatal)", msg)
      }
    }

    // ── Find existing product by handle ──
    const existingProducts = await productService.listProducts(
      { handle },
      { select: ["id", "handle", "metadata", "collection_id"], relations: ["variants"], take: 1 }
    )
    const existing = existingProducts.length > 0 ? existingProducts[0] : null

    if (existing?.id) {
      const existingCompany = existing.metadata?.tca_company_id
      if (existingCompany != null && String(existingCompany).trim() !== body.tca_company_id.trim()) {
        return res.status(409).json({
          message: "This product handle is already tied to a different TCA company.",
        })
      }
    }

    let productId: string
    let variantId: string

    const inventoryFlags = mapInventoryToVariantFlags(inventoryEnabled, trackInventory)

    const productMetadata: Record<string, unknown> = {
      tca_company_id: body.tca_company_id,
      tca_menu_item_id: body.tca_menu_item_id,
      tca_type: body.type ?? "menu_item",
      tca_category: categoryName ?? null,
      tca_image_url: imageUrl ?? null,
      tca_company_name: companyName ?? null,
      is_vegetarian: body.is_vegetarian ?? false,
      is_vegan: body.is_vegan ?? false,
      is_gluten_free: body.is_gluten_free ?? false,
      allergens: body.allergens ?? null,
      ingredients: body.ingredients ?? null,
    }

    if (!existing) {
      console.log("[tca-sync] Creating product", { handle, title, hasImage: !!imageUrl })

      const workflowInput = {
        products: [
          {
            title,
            handle,
            description,
            subtitle: categoryName ?? "",
            status: isOrderable ? ("published" as const) : ("draft" as const),
            thumbnail: imageUrl ?? "",
            images: imageUrl ? [{ url: imageUrl }] : [],
            collection_id: collectionId ?? undefined,
            metadata: productMetadata,
            options: [{ title: "Default", values: ["Default"] }],
            variants: [
              {
                title: "Default",
                options: { Default: "Default" },
                manage_inventory: inventoryFlags.manage_inventory,
                allow_backorder: inventoryFlags.allow_backorder,
                prices: [{ amount: priceMinorUnits, currency_code: normalizedCurrency }],
              },
            ],
          },
        ],
      }

      let createResult: any
      try {
        const wfOutput = await createProductsWorkflow(req.scope).run({ input: workflowInput })
        createResult = wfOutput.result
      } catch (wfErr) {
        const detail = wfErr instanceof Error
          ? { message: wfErr.message, stack: wfErr.stack }
          : JSON.stringify(wfErr, null, 2)
        console.error("[tca-sync] createProductsWorkflow threw:", detail)
        throw wfErr
      }

      const created = Array.isArray(createResult) ? createResult[0] : createResult
      productId = created?.id
      variantId = created?.variants?.[0]?.id

      console.log("[tca-sync] Created product result", {
        productId,
        variantId,
        thumbnail: created?.thumbnail ?? "(none)",
        imageCount: created?.images?.length ?? 0,
      })

      if (!productId || !variantId) {
        throw new Error("Product created but product/variant ID missing in response.")
      }
    } else {
      console.log("[tca-sync] Updating product", { productId: existing.id, handle, hasImage: !!imageUrl })

      productId = existing.id
      variantId = existing.variants?.[0]?.id
      if (!variantId) {
        throw new Error("Existing product missing variant to update.")
      }

      await updateProductsWorkflow(req.scope).run({
        input: {
          products: [
            {
              id: existing.id,
              title,
              description,
              subtitle: categoryName ?? "",
              status: isOrderable ? ("published" as const) : ("draft" as const),
              thumbnail: imageUrl ?? "",
              images: imageUrl ? [{ url: imageUrl }] : [],
              collection_id: collectionId ?? existing.collection_id ?? undefined,
              metadata: { ...(existing.metadata ?? {}), ...productMetadata },
              variants: [
                {
                  id: variantId,
                  manage_inventory: inventoryFlags.manage_inventory,
                  allow_backorder: inventoryFlags.allow_backorder,
                  prices: [{ amount: priceMinorUnits, currency_code: normalizedCurrency }],
                },
              ],
            },
          ],
        },
      })
    }

    // ── Upsert TCA company record ──
    const tcaSvc = req.scope.resolve(TCA_COMPANY_MODULE) as TcaCompanyModuleService

    let tcaRow
    try {
      tcaRow = await tcaSvc.upsertByExternalCompanyId({
        external_company_id: body.tca_company_id,
        name: companyName ?? title,
        sync_status: "ok",
        last_sync_at: new Date(),
        last_sync_error: null,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return res.status(500).json({ message: "Failed to upsert TCA company record.", error: message })
    }

    // ── Link (best-effort) ──
    let linkOk = false
    try {
      await ensureProductTcaCompanyLink(req.scope, productId, tcaRow.id)
      linkOk = true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn("[tca-sync] Link failed (non-fatal)", msg)
    }

    console.log("[tca-sync] Success", {
      mode: existing ? "updated" : "created",
      productId, variantId,
      collectionId: collectionId ?? null,
      linkOk,
    })

    return res.status(200).json({
      success: true, productId, variantId,
      collectionId: collectionId ?? null,
      tca_company_record_id: tcaRow.id,
      mode: existing ? "updated" : "created",
      linkOk,
      inventory: { inventory_enabled: inventoryEnabled, track_inventory: trackInventory, inventory_quantity: quantity, is_orderable: isOrderable },
    })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message
      : typeof e === "object" && e !== null ? JSON.stringify(e, null, 2) : String(e)
    console.error("[tca-sync] Sync failed", { error: errMsg, handle })
    return res.status(502).json({ message: "Failed syncing product to Medusa.", error: errMsg })
  }
}

// ─── Collection find-or-create ──────────────────────────────────────────────

async function findOrCreateCollection(
  scope: any,
  productService: any,
  companyName: string,
  tcaCompanyId: string,
): Promise<string> {
  const collectionHandle = buildCollectionHandle(companyName)

  const existing = await productService.listProductCollections(
    { handle: collectionHandle },
    { select: ["id"], take: 1 },
  )
  if (existing.length > 0) return existing[0].id

  console.log("[tca-sync] Creating collection", { title: companyName, handle: collectionHandle })
  const { result } = await createCollectionsWorkflow(scope).run({
    input: {
      collections: [{
        title: companyName,
        handle: collectionHandle,
        metadata: { tca_company_id: tcaCompanyId },
      }],
    },
  })

  const created = (result as any[])?.[0]
  if (!created?.id) throw new Error("Collection created but ID missing")
  return created.id
}

function buildCollectionHandle(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "").slice(0, 180)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildHandle(companyId: string, menuItemId: string) {
  const c = companyId.toLowerCase().replace(/[^a-z0-9-]/g, "-")
  const m = menuItemId.toLowerCase().replace(/[^a-z0-9-]/g, "-")
  return `tca-${c}-${m}`.replace(/-{2,}/g, "-").slice(0, 180)
}

function mapInventoryToVariantFlags(inventoryEnabled: boolean, trackInventory: boolean) {
  if (!inventoryEnabled || !trackInventory) return { manage_inventory: false, allow_backorder: true }
  return { manage_inventory: true, allow_backorder: false }
}
