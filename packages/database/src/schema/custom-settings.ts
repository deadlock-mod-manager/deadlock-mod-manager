import { sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const customSettings = pgTable("custom_setting", {
  id: text("id")
    .primaryKey()
    .default(sql`concat('custom_setting_', gen_random_uuid())`),
  key: text("key").notNull(),
  value: text("value").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type CustomSetting = typeof customSettings.$inferSelect;
export type NewCustomSetting = typeof customSettings.$inferInsert;
