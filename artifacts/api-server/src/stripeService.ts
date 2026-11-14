import { getUncachableStripeClient } from "./stripeClient.js";

export class StripeService {
  async createCustomer(email: string, userId: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.customers.create({
      email,
      metadata: { userId },
    });
  }

  /**
   * Create a Checkout session for any price. The mode follows the price
   * type: recurring prices use mode "subscription", one-time prices
   * (Single $19, Bundle $49) use mode
   * "payment" — a one-time price in a subscription-mode session is
   * rejected by Stripe. The Supabase user id is stamped on the session
   * (client_reference_id + metadata) so the webhook can link a paid
   * one-time purchase back to the buyer and grant the entitlement.
   */
  async createCheckoutSession(
    customerId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
    userId?: string,
  ) {
    const stripe = await getUncachableStripeClient();
    const price = await stripe.prices.retrieve(priceId);
    const mode = price.type === "one_time" ? "payment" : "subscription";
    return await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode,
      ...(userId
        ? { client_reference_id: userId, metadata: { supabaseUserId: userId } }
        : {}),
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  async createCustomerPortalSession(customerId: string, returnUrl: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }
}

export const stripeService = new StripeService();
