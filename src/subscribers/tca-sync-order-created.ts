import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

async function postToTcaSync(eventName: string, payload: unknown) {
  const url = process.env.TCA_SYNC_WEBHOOK_URL
  const secret = process.env.TCA_SYNC_WEBHOOK_SECRET

  if (!url || !secret) {
    // Fail loudly so you notice misconfig in Medusa logs
    throw new Error("Missing TCA_SYNC_WEBHOOK_URL or TCA_SYNC_WEBHOOK_SECRET")
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tca-sync-secret": secret,
    },
    body: JSON.stringify({
      id: crypto.randomUUID(),      // any unique id
      name: eventName,              // e.g. "order.created"
      data: payload,                // your event data
      created_at: new Date().toISOString(),
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`TCA sync webhook failed ${res.status}: ${text || "empty response"}`)
  }
}

export default async function handler({ event }: SubscriberArgs<any>) {
  await postToTcaSync("order.created", event.data)
}

export const config: SubscriberConfig = {
  event: "order.created",
}