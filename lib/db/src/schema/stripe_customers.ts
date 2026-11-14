import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Stripe customer ↔ app user link.
 *
 * NOTE: the `clerk_user_id` column name predates the Nov 14 2026
 * migration from Clerk to Supabase Auth and was kept deliberately to
 * avoid a live-database column rename. It now stores the Supabase
 * user id (a UUID string) — the column is TEXT, so a UUID fits.
 */
export const stripeCustomersTable = pgTable("stripe_customers", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StripeCustomer = typeof stripeCustomersTable.$inferSelect;
export type InsertStripeCustomer = typeof stripeCustomersTable.$inferInsert;
