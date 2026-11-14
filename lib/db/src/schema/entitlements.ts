import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Paid plan granted to a user. 'free' is the default (no row needed).
 *
 * Legacy values 'pro', 'bundle' and 'single' are superseded (Nov 13 2026,
 * "Taste. Train. Prove."): their Stripe prices were archived and the
 * webhook no longer grants them. They stay in the enum only so old rows
 * keep parsing; nothing grants them and nothing treats them as access.
 * The live plan is 'membership' (Practice Membership, $20/mo).
 */
export const planEnum = z.enum(["free", "pro", "bundle", "single", "membership"]);
export type Plan = z.infer<typeof planEnum>;

/** Exam a test-attempt grant is scoped to (one of "A+", "Network+", "Security+"). */
export type ExamScope = "A+" | "Network+" | "Security+";

/**
 * Entitlements (P0-4). One row per user; the source of truth for Practice
 * Membership access alongside the live Stripe subscription check.
 *
 * Rows are written by the Stripe webhook handler (Practice Membership
 * subscription events — see membershipGrants.ts in the api-server) /
 * admin grant flow. The server treats a user as a practice member when
 * EITHER this row says 'membership' and is not expired, OR Stripe reports
 * an active/trialing subscription whose price carries plan=membership.
 *
 * One-time test purchases do NOT write to this table — they grant sim
 * attempts in the sim_attempts table instead (see oneTimeGrants.ts).
 * Membership never grants sim attempts.
 */
export const entitlementsTable = pgTable("entitlements", {
  userId: text("user_id").primaryKey(),
  plan: text("plan").$type<Plan>().notNull().default("free"),
  /** Exam scope. Unused under the new model (membership covers all exams); kept for old rows. */
  examScope: text("exam_scope").$type<ExamScope | null>(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEntitlementSchema = createInsertSchema(entitlementsTable).omit({
  updatedAt: true,
});

export type InsertEntitlement = z.infer<typeof insertEntitlementSchema>;
export type Entitlement = typeof entitlementsTable.$inferSelect;
