import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const quizResultsTable = pgTable("quiz_results", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  category: text("category").notNull(),
  mode: text("mode").notNull(),
  // Tier exam number (1 | 2 | 3) when the result came from a tier exam;
  // null for fast/full/simulation/topic results. Added for P0-3/P0-4 so
  // tier unlocks can be verified server-side from past results.
  tier: integer("tier"),
  score: integer("score").notNull(),
  totalQuestions: integer("total_questions").notNull(),
  correctCount: integer("correct_count").notNull(),
  scaledScore: integer("scaled_score").notNull(),
  weakAreaIds: jsonb("weak_area_ids").$type<number[]>().default([]).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuizResultSchema = createInsertSchema(quizResultsTable).omit({
  id: true,
  completedAt: true,
});

export type InsertQuizResult = z.infer<typeof insertQuizResultSchema>;
export type QuizResult = typeof quizResultsTable.$inferSelect;
