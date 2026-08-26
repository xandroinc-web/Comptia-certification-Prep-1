import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adminMediaTable = pgTable("admin_media", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull().default("link"),
  title: text("title").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
});

export const insertAdminMediaSchema = createInsertSchema(adminMediaTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAdminMedia = z.infer<typeof insertAdminMediaSchema>;
export type AdminMedia = typeof adminMediaTable.$inferSelect;