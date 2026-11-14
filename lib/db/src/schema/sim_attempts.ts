import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import type { ExamScope } from "./entitlements.js";

/**
 * Full-test attempts (new pricing model, Nov 13 2026 — "Taste. Train. Prove.").
 *
 * One row per (user, exam). A Full Test checkout ($9.99, one-time) grants
 * 1 attempt for that exam; a Trifecta Tests checkout ($24.99, one-time)
 * grants 1 attempt per exam. Attempts are valid 90 days from purchase.
 * Practice Membership does NOT grant sim attempts, and a test purchase
 * grants NO practice access — the two products are separate.
 *
 * The sim route decrements `remaining` atomically on sim start (see
 * consumeTestAttempt in the api-server's lib/access.ts). `lastSessionId`
 * makes webhook re-delivery idempotent: a re-delivered checkout.session
 * event with the same session id is not granted twice.
 *
 * Admins bypass attempts entirely (no row needed).
 */
export const simAttemptsTable = pgTable(
  "sim_attempts",
  {
    userId: text("user_id").notNull(),
    exam: text("exam").$type<ExamScope>().notNull(),
    /** Attempts left for this exam. Decremented on sim start; 0 = spent. */
    remaining: integer("remaining").notNull().default(0),
    /** Attempts expire 90 days after the purchase that granted them. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Stripe checkout session id that last granted attempts (idempotency). */
    lastSessionId: text("last_session_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.exam] })],
);

export const insertSimAttemptSchema = createInsertSchema(simAttemptsTable).omit({
  updatedAt: true,
});

export type InsertSimAttempt = z.infer<typeof insertSimAttemptSchema>;
export type SimAttempt = typeof simAttemptsTable.$inferSelect;
