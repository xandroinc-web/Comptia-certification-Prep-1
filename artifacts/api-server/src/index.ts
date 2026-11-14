import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient.js";
import app from "./app.js";
import { logger } from "./lib/logger.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set, skipping Stripe initialization");
    return;
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    logger.warn("STRIPE_SECRET_KEY not set, skipping Stripe initialization");
    return;
  }

  try {
    logger.info("Initializing Stripe schema...");
    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");

    // Ensure stripe_customers table exists in public schema.
    // NOTE: clerk_user_id predates the Supabase Auth migration and
    // now stores Supabase user UUIDs (kept to avoid a live-DB rename).
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(
      sql`
        CREATE TABLE IF NOT EXISTS stripe_customers (
          clerk_user_id TEXT PRIMARY KEY,
          stripe_customer_id TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
      `
    );

    // Attempt webhook setup and sync -- don't fail if these error
    try {
      const stripeSync = await getStripeSync();

      logger.info("Setting up managed webhook...");
      const domains = process.env.REPLIT_DOMAINS;
      if (domains) {
        const webhookBaseUrl = `https://${domains.split(",")[0]}`;
        const webhookResult = await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`,
        );
        logger.info(
          { webhookUrl: (webhookResult as any)?.url },
          "Webhook configured",
        );
      }

      logger.info("Syncing Stripe data...");
      stripeSync
        .syncBackfill()
        .then(() => logger.info("Stripe data synced"))
        .catch((err) => logger.error({ err }, "Error syncing Stripe data"));
    } catch (syncErr) {
      logger.warn(
        { err: syncErr },
        "Stripe sync/webhook setup failed (non-critical); app will still function",
      );
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to initialize Stripe");
  }
}

await initStripe();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
