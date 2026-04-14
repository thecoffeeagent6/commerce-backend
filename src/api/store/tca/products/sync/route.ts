import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"
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

export async function POST(req: MedusaRequest<SyncBody>, res: MedusaResponse) {
  const body = req.body

  console.log("[tca-sync] POST /store/tca/products/sync called", {
    tca_company_id: body?.tca_company_id ?? "(missing)",
    tca_menu_item_id: body?.tca_menu_item_id ?? "(missing)",
    title: body?.title ?? "(missing)",
  })

  const publishableKey = process.env.MEDUSA_PUBLISHABLE_KEY ?? ""
  const receivedPk =
    (req.headers["x-publishable-api-key"] as string | undefined) ?? ""

  if (publishableKey && receivedPk.trim() != publishableKey.trim()) {
    console.warn("[tca-sync] Publishable key mismatch")
    return res.status(401).json({ message: "Invalid publishable API key." })
  }

  if (!body?.tca_company_id || !body?.tca_menu_item_id || !body?.title) {
    console.warn("[tca-sync] Missing required fields in body")
    return res.status(400).json({
      message:
        "Missing required fields: tca_company_id, tca_menu_item_id, title.",
    })
  }

  const normalizedCurrency = (body.currency_code || "usd").toLowerCase()
  const priceMinorUnits = Math.max(
    0,
    Math.round((body.price_amount ?? 0) * 100)
  )
  const quantity = Math.max(0, Number(body.inventory_quantity ?? 0))
  const inventoryEnabled = body.inventory_enabled === true
  const trackInventory = body.track_inventory === true
  const isOrderable = body.is_orderable === true
  const handle = buildHandle(body.tca_company_id, body.tca_menu_item_id)
  const title = body.title.trim()

  try {
    const productService: any = req.scope.resolve(Modules.PRODUCT)

    const existingProducts = await productService.listProducts(
      { handle },
      {
        select: ["id", "handle", "metadata"],
        relations: ["variants"],
        take: 1,
      }
    )
    const existing = existingProducts.length > 0 ? existingProducts[0] : null

    if (existing?.id) {
      const existingCompany = existing.metadata?.tca_company_id
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

    const inventoryFlags = mapInventoryToVariantFlags(
      inventoryEnabled,
      trackInventory
    )

    if (!existing) {
      console.log("[tca-sync] Creating product via workflow", { handle, title })

      const workflowInput = {
        products: [
          {
            title,
            handle,
            status: isOrderable ? ("published" as const) : ("draft" as const),
            metadata: {
              tca_company_id: body.tca_company_id,
              tca_menu_item_id: body.tca_menu_item_id,
              tca_type: body.type ?? "menu_item",
            },
            options: [{ title: "Default", values: ["Default"] }],
            variants: [
              {
                title: "Default",
                options: { Default: "Default" },
                manage_inventory: inventoryFlags.manage_inventory,
                allow_backorder: inventoryFlags.allow_backorder,
                prices: [
                  {
                    amount: priceMinorUnits,
                    currency_code: normalizedCurrency,
                  },
                ],
              },
            ],
          },
        ],
      }

      console.log("[tca-sync] Workflow input:", JSON.stringify(workflowInput, null, 2))

      let createResult: any
      try {
        const wfOutput = await createProductsWorkflow(req.scope).run({
          input: workflowInput,
        })
        createResult = wfOutput.result
        console.log("[tca-sync] Workflow result:", JSON.stringify(createResult, null, 2).slice(0, 1000))
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
      if (!productId || !variantId) {
        console.error("[tca-sync] Missing IDs in result:", JSON.stringify(created, null, 2).slice(0, 500))
        throw new Error(
          "Product created but product/variant ID missing in response."
        )
      }
    } else {
      console.log("[tca-sync] Updating product via workflow", {
        productId: existing.id,
        handle,
      })

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
              status: isOrderable ? "published" : "draft",
              metadata: {
                tca_company_id: body.tca_company_id,
                tca_menu_item_id: body.tca_menu_item_id,
                tca_type: body.type ?? "menu_item",
              },
              variants: [
                {
                  id: variantId,
                  manage_inventory: inventoryFlags.manage_inventory,
                  allow_backorder: inventoryFlags.allow_backorder,
                  prices: [
                    {
                      amount: priceMinorUnits,
                      currency_code: normalizedCurrency,
                    },
                  ],
                },
              ],
            },
          ],
        },
      })
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
      console.log("[tca-sync] Linking product to TCA company", {
        productId,
        tcaCompanyInternalId: tcaRow.id,
        externalCompanyId: body.tca_company_id,
      })
      await ensureProductTcaCompanyLink(req.scope, productId, tcaRow.id)
      console.log("[tca-sync] Link created successfully")
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      const stack = e instanceof Error ? e.stack : undefined
      const detail = typeof e === "object" && e !== null && !(e instanceof Error)
        ? JSON.stringify(e, null, 2)
        : undefined
      console.error("[tca-sync] Link failed", { message, stack, detail })
      await tcaSvc.recordSyncError(
        body.tca_company_id,
        `link_failed: ${message}`
      )
      return res.status(502).json({
        message:
          "Product was created/updated in Medusa but linking to TCA company failed. Retry sync to repair.",
        error: message,
        productId,
        variantId,
      })
    }

    console.log("[tca-sync] Success", {
      mode: existing ? "updated" : "created",
      productId,
      variantId,
      tca_company_record_id: tcaRow.id,
    })

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
    const errMsg = e instanceof Error
      ? e.message
      : typeof e === "object" && e !== null
        ? JSON.stringify(e, null, 2)
        : String(e)
    const errStack = e instanceof Error ? e.stack : undefined
    console.error("[tca-sync] Sync failed", {
      error: errMsg,
      stack: errStack,
      rawType: typeof e,
      handle,
    })
    return res.status(502).json({
      message: "Failed syncing product to Medusa.",
      error: errMsg,
    })
  }
}

function buildHandle(companyId: string, menuItemId: string) {
  const normalizedCompany = companyId.toLowerCase().replace(/[^a-z0-9-]/g, "-")
  const normalizedItem = menuItemId.toLowerCase().replace(/[^a-z0-9-]/g, "-")
  return `tca-${normalizedCompany}-${normalizedItem}`
    .replace(/-{2,}/g, "-")
    .slice(0, 180)
}

function mapInventoryToVariantFlags(
  inventoryEnabled: boolean,
  trackInventory: boolean
) {
  if (!inventoryEnabled) {
    return { manage_inventory: false, allow_backorder: true }
  }
  if (inventoryEnabled && !trackInventory) {
    return { manage_inventory: false, allow_backorder: true }
  }
  return { manage_inventory: true, allow_backorder: false }
}
