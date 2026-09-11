import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adminQuestionsTable = pgTable("admin_questions", {
  id: serial("id").primaryKey(),
  externalId: text("external_id"),
  category: text("category").notNull().default("A+"),
  tier: integer("tier").notNull().default(2),
  difficulty: text("difficulty").notNull().default("medium"),
  question: text("question").notNull(),
  options: jsonb("options").$type<string[]>().notNull(),
  correctIndex: integer("correct_index").notNull(),
  explanation: text("explanation").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
});

export const insertAdminQuestionSchema = createInsertSchema(adminQuestionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAdminQuestion = z.infer<typeof insertAdminQuestionSchema>;
export type AdminQuestion = typeof adminQuestionsTable.$inferSelect;