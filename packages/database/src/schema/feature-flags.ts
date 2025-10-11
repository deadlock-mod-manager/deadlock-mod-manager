import { json, pgTable, text } from "drizzle-orm/pg-core";
import { typeid as generateTypeId } from "typeid-js";
import { typeId } from "../extensions/typeid";
import { timestamps } from "./shared/timestamps";

export const featureFlagTypes = [
  "boolean",
  "string",
  "number",
  "json",
] as const;

export type FeatureFlagType = (typeof featureFlagTypes)[number];

export const featureFlags = pgTable("feature_flags", {
  id: typeId("id", "feature_flag")
    .primaryKey()
    .$defaultFn(() => generateTypeId("feature_flag").toString()),
  name: text("name").notNull().unique(),
  description: text("description"),
  type: text("type", { enum: featureFlagTypes }).notNull().default("boolean"),
  value: json("value").notNull().default(false),
  ...timestamps,
});

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type NewFeatureFlag = typeof featureFlags.$inferInsert;
