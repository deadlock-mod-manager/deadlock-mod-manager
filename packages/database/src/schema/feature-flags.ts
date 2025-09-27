import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { typeid as generateTypeId } from "typeid-js";
import { typeId } from "../extensions/typeid";
import { timestamps } from "./shared/timestamps";

export const featureFlags = pgTable("feature_flags", {
  id: typeId("id", "feature_flag")
    .primaryKey()
    .$defaultFn(() => generateTypeId("feature_flag").toString()),
  name: text("name").notNull().unique(),
  description: text("description"),
  value: boolean("value").notNull().default(false),
  ...timestamps,
});

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type NewFeatureFlag = typeof featureFlags.$inferInsert;
