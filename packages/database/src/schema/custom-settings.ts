import { pgTable, text } from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { timestamps } from "./shared/timestamps";

export const customSettings = pgTable("custom_setting", {
  id: typeId("id", "custom_setting")
    .primaryKey()
    .$defaultFn(() => generateId("custom_setting").toString()),
  key: text("key").notNull(),
  value: text("value").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  ...timestamps,
});

export type CustomSetting = typeof customSettings.$inferSelect;
export type NewCustomSetting = typeof customSettings.$inferInsert;
