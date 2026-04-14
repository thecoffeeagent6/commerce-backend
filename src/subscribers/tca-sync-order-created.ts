import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

async function postToTcaSync(eventName: string, payload: unknown) {
  const url = process.env.TCA_SYNC_WEBHOOK_URL
  const secret = process.env.TCA_MEDUSA_WEBHOOK_SECRET

  console.log(`[tca-subscriber] ${eventName} fired`, {
    TCA_SYNC_WEBHOOK_URL: url ? "set" : "MISSING",
    TCA_MEDUSA_WEBHOOK_SECRET: secret ? "set" : "MISSING",
  })

  if (!url || !secret) {
    throw new Error("Missing TCA_SYNC_WEBHOOK_URL or TCA_MEDUSA_WEBHOOK_SECRET")
  }

  const body = JSON.stringify({
    id: crypto.randomUUID(),
    name: eventName,
    data: payload,
    created_at: new Date().toISOString(),
  })

  console.log(`[tca-subscriber] POSTing to ${url.slice(0, 50)}...`)

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tca-sync-secret": secret,
    },
    body,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    console.error(`[tca-subscriber] Webhook failed ${res.status}:`, text.slice(0, 500))
    throw new Error(`TCA sync webhook failed ${res.status}: ${text || "empty response"}`)
  }

  console.log(`[tca-subscriber] Webhook succeeded (${res.status})`)
}

export default async function handler({ event }: SubscriberArgs<any>) {
  console.log("[tca-subscriber] order.created handler invoked")
  await postToTcaSync("order.created", event.data)
}

export const config: SubscriberConfig = {
  event: "order.created",
}