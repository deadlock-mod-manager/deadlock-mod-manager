import { boolean, json, pgTable, text, unique } from "drizzle-orm/pg-core";
import { typeid as generateTypeId } from "typeid-js";
import { typeId } from "../extensions/typeid";
import { user } from "./auth";
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
  exposed: boolean("exposed").notNull().default(false),
  ...timestamps,
});

export const userFeatureFlagOverrides = pgTable(
  "user_feature_flag_overrides",
  {
    id: typeId("id", "user_feature_flag_override")
      .primaryKey()
      .$defaultFn(() =>
        generateTypeId("user_feature_flag_override").toString(),
      ),
    userId: typeId("user_id", "user")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    featureFlagId: typeId("feature_flag_id", "feature_flag")
      .references(() => featureFlags.id, { onDelete: "cascade" })
      .notNull(),
    value: json("value").notNull(),
    ...timestamps,
  },
  (table) => [unique().on(table.userId, table.featureFlagId)],
);

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type NewFeatureFlag = typeof featureFlags.$inferInsert;

export type UserFeatureFlagOverride =
  typeof userFeatureFlagOverrides.$inferSelect;
export type NewUserFeatureFlagOverride =
  typeof userFeatureFlagOverrides.$inferInsert;
