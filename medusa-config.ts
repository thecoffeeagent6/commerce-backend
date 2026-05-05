import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

/** Stripe secret key (sk_...). Set in Medusa Cloud secrets / env: STRIPE_SECRET_KEY (or STRIPE_API_KEY). */
const stripeSecretKey =
  process.env.STRIPE_SECRET_KEY?.trim() ||
  process.env.STRIPE_API_KEY?.trim()

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  modules: [
    {
      resolve: "./src/modules/tca_company",
    },
    {
      // Register Stripe as a *payment provider* on the Payment module (not a top-level module).
      // Top-level `@medusajs/payment-stripe` is a ModuleProvider and breaks `defineConfig` module resolution.
      key: "payment",
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/payment-stripe",
            id: "stripe",
            options: {
              apiKey: stripeSecretKey,
              ...(process.env.STRIPE_WEBHOOK_SECRET
                ? { webhookSecret: process.env.STRIPE_WEBHOOK_SECRET }
                : {}),
            },
          },
        ],
      },
    },
  ],
})
