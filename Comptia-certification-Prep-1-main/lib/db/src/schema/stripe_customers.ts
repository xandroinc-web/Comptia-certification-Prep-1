import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const stripeCustomersTable = pgTable("stripe_customers", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StripeCustomer = typeof stripeCustomersTable.$inferSelect;
export type InsertStripeCustomer = typeof stripeCustomersTable.$inferInsert;
