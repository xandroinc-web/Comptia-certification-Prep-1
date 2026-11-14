import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { getUncachableStripeClient } from "./stripeClient.js";

export class StripeStorage {
  async listProductsWithPrices(active = true, limit = 20, offset = 0) {
    // Try database first
    try {
      const result = await db.execute(
        sql`
          WITH paginated_products AS (
            SELECT id, name, description, metadata, active
            FROM stripe.products
            WHERE active = ${active}
            ORDER BY id
            LIMIT ${limit} OFFSET ${offset}
          )
          SELECT
            p.id as product_id,
            p.name as product_name,
            p.description as product_description,
            p.active as product_active,
            p.metadata as product_metadata,
            pr.id as price_id,
            pr.unit_amount,
            pr.currency,
            pr.recurring,
            pr.active as price_active,
            pr.metadata as price_metadata
          FROM paginated_products p
          LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
          ORDER BY p.id, pr.unit_amount
        `
      );
      if (result.rows.length > 0) return result.rows;
    } catch {
      // Fall through to Stripe API
    }

    // Fallback: query Stripe API directly
    const stripe = await getUncachableStripeClient();
    const products = await stripe.products.list({ active: true, limit });
    const prices = await stripe.prices.list({ active: true, limit: 100 });

    const rows: any[] = [];
    for (const product of products.data) {
      const productPrices = prices.data.filter((p) => p.product === product.id);
      for (const price of productPrices) {
        rows.push({
          product_id: product.id,
          product_name: product.name,
          product_description: product.description,
          product_active: product.active,
          product_metadata: product.metadata,
          price_id: price.id,
          unit_amount: price.unit_amount,
          currency: price.currency,
          recurring: price.recurring,
          price_active: price.active,
          price_metadata: price.metadata,
        });
      }
      if (productPrices.length === 0) {
        rows.push({
          product_id: product.id,
          product_name: product.name,
          product_description: product.description,
          product_active: product.active,
          product_metadata: product.metadata,
          price_id: null,
          unit_amount: null,
          currency: null,
          recurring: null,
          price_active: null,
          price_metadata: null,
        });
      }
    }
    return rows;
  }

  async getSubscriptionByCustomer(customerId: string) {
    try {
      const result = await db.execute(
        sql`SELECT * FROM stripe.subscriptions WHERE customer = ${customerId} AND status = 'active' LIMIT 1`
      );
      if (result.rows.length > 0) return result.rows[0];
    } catch {
      // Fall through
    }

    // Fallback: query Stripe API directly
    const stripe = await getUncachableStripeClient();
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });
    return subs.data[0] || null;
  }
}

export const stripeStorage = new StripeStorage();
