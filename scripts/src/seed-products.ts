import Stripe from "stripe";

/**
 * Seed Stripe TEST products + prices for Trifecta Quiz (new pricing
 * model, Nov 13 2026 — "Taste. Train. Prove.").
 *
 * SDK-based path, for running on a real machine (the sandbox cannot reach
 * Stripe with the Node SDK — use curl there instead; see the equivalent
 * idempotent shell steps in the Stream C report).
 *
 * Idempotent: every product/price is looked up first (by name, then by
 * amount + type + grant metadata) and skipped when it already exists.
 * Superseded prices are archived (active=false) so they cannot be
 * purchased.
 *
 * Products / prices:
 *   Full Test — A+         $9.99 one-time, one attempt (grant=test, exam=A+)
 *   Full Test — Network+   $9.99 one-time, one attempt (grant=test, exam=Network+)
 *   Full Test — Security+  $9.99 one-time, one attempt (grant=test, exam=Security+)
 *   Trifecta Tests         $24.99 one-time, one attempt per exam (grant=bundle_tests)
 *   Practice Membership    $20.00/month recurring (plan=membership)
 *
 * Superseded (Nov 13) — archived by this script, do NOT re-add:
 *   CompTIA Pro $9.99/mo + $79.99/yr, Single Exam Pass $19 × 3,
 *   Trifecta Bundle $49, Pro 2-year $129, Lifetime $149.
 *   Their grant keys (single / bundle) return NO grant under the new
 *   model — see oneTimeGrants.ts.
 *
 * Grant durations (owner-locked assumptions, mirrored in
 * artifacts/api-server/src/lib/oneTimeGrants.ts ONE_TIME_GRANT_DURATIONS):
 *   Full Test = 90 days, Trifecta Tests = 90 days.
 *
 * The price `metadata.grant` (+ `metadata.exam` for a Full Test) is the
 * source of truth the webhook uses to grant sim attempts, and
 * `metadata.plan=membership` is what marks the Practice Membership
 * price — do not rename them.
 */

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error("STRIPE_SECRET_KEY is required");
  process.exit(1);
}

const stripe = new Stripe(secretKey);

interface PriceSpec {
  unitAmount: number;
  recurring?: { interval: "month" | "year" };
  metadata: Record<string, string>;
  label: string;
}

interface ProductSpec {
  name: string;
  description: string;
  metadata: Record<string, string>;
  prices: PriceSpec[];
}

const PRODUCTS: ProductSpec[] = [
  ...(["A+", "Network+", "Security+"] as const).map((exam) => ({
    name: `Full Test — ${exam}`,
    description: `One full 90-question, 90-minute simulation for ${exam} — one attempt, valid 90 days`,
    metadata: { type: "test", exam },
    prices: [
      { unitAmount: 999, metadata: { grant: "test", exam }, label: `$9.99 one-time (${exam}, one attempt, 90 days)` },
    ],
  })),
  {
    name: "Trifecta Tests",
    description: "One full 90-question, 90-minute simulation per exam (A+, Network+, Security+) — one attempt each, valid 90 days",
    metadata: { type: "bundle_tests" },
    prices: [
      { unitAmount: 2499, metadata: { grant: "bundle_tests" }, label: "$24.99 one-time (one attempt per exam, 90 days)" },
    ],
  },
  {
    name: "Practice Membership",
    description: "Unlimited practice — Fast quizzes, all tier exams, weak-area drills, all three exams. Does not include full simulations.",
    metadata: { type: "membership" },
    prices: [
      { unitAmount: 2000, recurring: { interval: "month" }, metadata: { plan: "membership" }, label: "$20.00/month" },
    ],
  },
];

/** Product names from the superseded model — any active price under one of these is archived. */
const SUPERSEDED_PRODUCT_NAMES = ["CompTIA Pro", "Single Exam Pass", "Trifecta Bundle"];

async function findProduct(name: string): Promise<Stripe.Product | null> {
  const existing = await stripe.products.search({
    query: `name:'${name}' AND active:'true'`,
  });
  return existing.data[0] ?? null;
}

async function findPrice(productId: string, spec: PriceSpec): Promise<Stripe.Price | null> {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  return (
    prices.data.find((price) => {
      if (price.unit_amount !== spec.unitAmount) return false;
      const wantRecurring = spec.recurring?.interval;
      if (wantRecurring) {
        return price.type === "recurring" && price.recurring?.interval === wantRecurring;
      }
      if (price.type !== "one_time") return false;
      return Object.entries(spec.metadata).every(([key, value]) => price.metadata[key] === value);
    }) ?? null
  );
}

async function archiveSupersededPrices(): Promise<void> {
  const products = await stripe.products.list({ limit: 100 });
  for (const product of products.data) {
    if (!SUPERSEDED_PRODUCT_NAMES.includes(product.name)) continue;
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
    for (const price of prices.data) {
      await stripe.prices.update(price.id, { active: false });
      console.log(`Archived superseded price: ${product.name} ${price.id} ($${(price.unit_amount ?? 0) / 100})`);
    }
  }
}

async function seedProducts() {
  console.log("Seeding products and prices in Stripe...");

  for (const spec of PRODUCTS) {
    let product = await findProduct(spec.name);
    if (product) {
      console.log(`Product already exists: ${spec.name} (${product.id})`);
    } else {
      product = await stripe.products.create({
        name: spec.name,
        description: spec.description,
        metadata: spec.metadata,
      });
      console.log(`Created product: ${product.name} (${product.id})`);
    }

    for (const priceSpec of spec.prices) {
      const existing = await findPrice(product.id, priceSpec);
      if (existing) {
        console.log(`  Price already exists: ${priceSpec.label} (${existing.id})`);
        continue;
      }
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: priceSpec.unitAmount,
        currency: "usd",
        ...(priceSpec.recurring ? { recurring: priceSpec.recurring } : {}),
        metadata: priceSpec.metadata,
      });
      console.log(`  Created price: ${priceSpec.label} (${price.id})`);
    }
  }

  await archiveSupersededPrices();

  console.log("Products and prices seeded successfully!");
}

seedProducts().catch((error: any) => {
  console.error("Error seeding products:", error.message);
  process.exit(1);
});
