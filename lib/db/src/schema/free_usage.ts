import { pgTable, uuid, text, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** What a free-usage row counts. */
export const freeUsageKindEnum = z.enum(["question", "simulation", "exam"]);
export type FreeUsageKind = z.infer<typeof freeUsageKindEnum>;

/**
 * Free-tier usage ledger (P0-4). One row per (identity, kind, day[, exam]).
 *
 * The free trial is ONE-TIME ONLY per user, ever — the cap is checked
 * against LIFETIME sums across all dates, never a single day, and
 * `usedDate` is telemetry only (a new day never refills anything).
 * - kind 'question': free questions served; the cap is 30 total
 *   (FREE_QUESTIONS_TOTAL in the api-server).
 * - kind 'simulation': free simulations taken; the cap is 1 total,
 *   so `exam` is set on these rows for telemetry (null for other kinds).
 * - kind 'exam': quiz attempts started (telemetry only — not capped).
 *
 * Identity is `userId` when signed in, else `anonId` (a client-generated
 * fingerprint the browser stores in localStorage). `usedDate` is a UTC
 * calendar day (YYYY-MM-DD).
 */
export const freeUsageTable = pgTable("free_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  anonId: text("anon_id"),
  kind: text("kind").$type<FreeUsageKind>().notNull(),
  exam: text("exam"),
  usedDate: date("used_date").notNull(),
  count: integer("count").default(1).notNull(),
});

export const insertFreeUsageSchema = createInsertSchema(freeUsageTable).omit({
  id: true,
});

export type InsertFreeUsage = z.infer<typeof insertFreeUsageSchema>;
export type FreeUsage = typeof freeUsageTable.$inferSelect;
