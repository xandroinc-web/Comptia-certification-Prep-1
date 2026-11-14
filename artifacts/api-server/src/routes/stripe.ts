import { Router, type IRouter } from "express";
import type { Request, Response } from "express";
import { requireAuth, getUserId } from "../lib/entitlements.js";
import { getUserEmail } from "../lib/supabase.js";
import { stripeService } from "../stripeService.js";
import { stripeStorage } from "../stripeStorage.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// GET /api/products-with-prices - list available products
router.get("/products-with-prices", async (_req, res) => {
  try {
    const rows = await stripeStorage.listProductsWithPrices();

    const productsMap = new Map();
    for (const row of rows) {
      if (!productsMap.has(row.product_id)) {
        productsMap.set(row.product_id, {
          id: row.product_id,
          name: row.product_name,
          description: row.product_description,
          active: row.product_active,
          metadata: row.product_metadata ?? {},
          prices: [],
        });
      }
      if (row.price_id) {
        productsMap.get(row.product_id).prices.push({
          id: row.price_id,
          unit_amount: row.unit_amount,
          currency: row.currency,
          recurring: row.recurring,
          active: row.price_active,
          // Price metadata carries the one-time grant mapping
          // (grant=single/bundle, exam for single)
          // — the client needs it to tell the three $19 Single prices apart.
          metadata: row.price_metadata ?? {},
        });
      }
    }

    res.json({ data: Array.from(productsMap.values()) });
  } catch (err) {
    console.error("Error listing products:", err);
    res.status(500).json({ error: "Failed to list products" });
  }
});

// POST /api/checkout - create checkout session
router.post("/checkout", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { priceId } = req.body;

    if (!priceId || typeof priceId !== "string") {
      res.status(400).json({ error: "priceId is required" });
      return;
    }

    const result = await db.execute(
      sql`SELECT stripe_customer_id FROM stripe_customers WHERE clerk_user_id = ${userId} LIMIT 1`
    );

    let customerId: string;
    if (result.rows.length > 0 && (result.rows[0] as any).stripe_customer_id) {
      customerId = (result.rows[0] as any).stripe_customer_id;
    } else {
      // Use the Supabase user's real email for receipts/invoices. Never
      // invent one: if Supabase Auth has no email for this user, fail the
      // checkout instead of creating a customer receipts can't reach.
      let email: string | undefined;
      try {
        email = (await getUserEmail(userId)) ?? undefined;
      } catch (supabaseError) {
        console.error("Checkout error: could not load Supabase user for email:", supabaseError);
        res.status(500).json({ error: "Could not verify your account email. Please try again." });
        return;
      }
      if (!email) {
        res.status(400).json({
          error:
            "No email address is on file for your account, so a Stripe customer cannot be created. " +
            "Add an email address to your account and try again.",
        });
        return;
      }
      const customer = await stripeService.createCustomer(email, userId);
      customerId = customer.id;
      await db.execute(
        sql`INSERT INTO stripe_customers (clerk_user_id, stripe_customer_id) VALUES (${userId}, ${customerId})`
      );
    }

    const hostRaw = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const host = Array.isArray(hostRaw) ? hostRaw[0] : String(hostRaw);
    const protocolRaw = req.headers["x-forwarded-proto"] || "https";
    const protocol = Array.isArray(protocolRaw) ? protocolRaw[0] : String(protocolRaw);
    const basePath = process.env.BASE_PATH || "";

    const successUrl = `${protocol}://${host}${basePath}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${protocol}://${host}${basePath}/checkout/cancel`;

    const session = await stripeService.createCheckoutSession(customerId, priceId, successUrl, cancelUrl, userId);

    res.json({ url: session.url });
  } catch (err: any) {
    console.error("Checkout error:", err.message);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// GET /api/subscription - get current user's subscription
router.get("/subscription", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);

    const result = await db.execute(
      sql`SELECT stripe_customer_id FROM stripe_customers WHERE clerk_user_id = ${userId} LIMIT 1`
    );

    if (result.rows.length === 0) {
      res.json({ subscription: null });
      return;
    }

    const customerId = (result.rows[0] as any).stripe_customer_id;
    const subscription = await stripeStorage.getSubscriptionByCustomer(customerId);

    const sub = subscription as any;
    res.json({
      subscription: sub
        ? {
            status: sub.status,
            current_period_end: sub.current_period_end,
            cancel_at_period_end: sub.cancel_at_period_end,
          }
        : null,
    });
  } catch (err: any) {
    console.error("Subscription error:", err.message);
    res.status(500).json({ error: "Failed to get subscription" });
  }
});

// POST /api/customer-portal - create billing portal session
router.post("/customer-portal", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);

    const result = await db.execute(
      sql`SELECT stripe_customer_id FROM stripe_customers WHERE clerk_user_id = ${userId} LIMIT 1`
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "No customer found" });
      return;
    }

    const customerId = (result.rows[0] as any).stripe_customer_id;
    const hostRaw = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const host = Array.isArray(hostRaw) ? hostRaw[0] : String(hostRaw);
    const protocolRaw = req.headers["x-forwarded-proto"] || "https";
    const protocol = Array.isArray(protocolRaw) ? protocolRaw[0] : String(protocolRaw);
    const basePath = process.env.BASE_PATH || "";
    const returnUrl = `${protocol}://${host}${basePath}/settings`;

    const portalSession = await stripeService.createCustomerPortalSession(customerId, returnUrl);

    res.json({ url: portalSession.url });
  } catch (err: any) {
    console.error("Portal error:", err.message);
    res.status(500).json({ error: "Failed to create portal session" });
  }
});

export default router;
