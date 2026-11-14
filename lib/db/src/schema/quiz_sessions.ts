import { pgTable, uuid, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * In-progress (and finished) quiz sessions, for save/resume (P0-3).
 *
 * One row per quiz attempt. The client creates it when a quiz starts
 * (with the served question ids + questionSetId) and updates `answers`
 * as the user answers, so a refresh or a new device can resume.
 * `answers` entries use the *served* option order for their question
 * set (see questionBank: option order is a deterministic function of
 * questionSetId, so a resumed session re-serves the same order).
 */
export const quizSessionsTable = pgTable("quiz_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  exam: text("exam").notNull(),
  mode: text("mode").notNull(),
  tier: integer("tier"),
  difficulty: text("difficulty"),
  questionIds: jsonb("question_ids").$type<string[]>().default([]).notNull(),
  answers: jsonb("answers")
    .$type<{ questionId: string; selectedIndex: number | null }[]>()
    .default([])
    .notNull(),
  /** Opaque client-generated id for the served question set; the server
   *  derives the per-question option shuffle from it, so resuming with
   *  the same questionSetId reproduces the same option order. */
  questionSetId: text("question_set_id"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completed: boolean("completed").default(false).notNull(),
});

export const insertQuizSessionSchema = createInsertSchema(quizSessionsTable).omit({
  id: true,
  startedAt: true,
  updatedAt: true,
});

export const updateQuizSessionSchema = z.object({
  exam: z.string().min(1).optional(),
  mode: z.string().min(1).optional(),
  tier: z.number().int().min(1).max(3).nullable().optional(),
  difficulty: z.string().nullable().optional(),
  questionIds: z.array(z.string()).optional(),
  answers: z.array(z.object({ questionId: z.string(), selectedIndex: z.number().int().min(0).nullable() })).optional(),
  questionSetId: z.string().nullable().optional(),
  completed: z.boolean().optional(),
});

export type InsertQuizSession = z.infer<typeof insertQuizSessionSchema>;
export type QuizSession = typeof quizSessionsTable.$inferSelect;
