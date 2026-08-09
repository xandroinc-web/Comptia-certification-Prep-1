import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error("STRIPE_SECRET_KEY is required");
  process.exit(1);
}

const stripe = new Stripe(secretKey);

async function createProducts() {
  try {
    console.log("Creating products and prices in Stripe...");

    // Check if Pro Plan product already exists
    const existingProducts = await stripe.products.search({
      query: "name:'CompTIA Pro' AND active:'true'",
    });

    if (existingProducts.data.length > 0) {
      console.log("CompTIA Pro product already exists. Skipping creation.");
      console.log(`Existing product ID: ${existingProducts.data[0].id}`);
      return;
    }

    const proProduct = await stripe.products.create({
      name: "CompTIA Pro",
      description: "Unlimited quizzes, detailed analytics, custom study plans, and ad-free experience",
      metadata: { tier: "pro" },
    });
    console.log(`Created product: ${proProduct.name} (${proProduct.id})`);

    const monthlyPrice = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 999,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { plan: "monthly" },
    });
    console.log(`Created monthly price: $9.99/month (${monthlyPrice.id})`);

    const yearlyPrice = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 7999,
      currency: "usd",
      recurring: { interval: "year" },
      metadata: { plan: "yearly" },
    });
    console.log(`Created yearly price: $79.99/year (${yearlyPrice.id})`);

    console.log("Products and prices created successfully!");
  } catch (error: any) {
    console.error("Error creating products:", error.message);
    process.exit(1);
  }
}

createProducts();
