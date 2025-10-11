import { integer, json, pgTable, text, unique } from "drizzle-orm/pg-core";
import { typeid as generateTypeId } from "typeid-js";
import { typeId } from "../extensions/typeid";
import { user } from "./auth";
import { featureFlags } from "./feature-flags";
import { timestamps } from "./shared/timestamps";

export const segments = pgTable("segments", {
  id: typeId("id", "segment")
    .primaryKey()
    .$defaultFn(() => generateTypeId("segment").toString()),
  name: text("name").notNull().unique(),
  description: text("description"),
  rank: integer("rank").notNull().default(0),
  ...timestamps,
});

export const segmentMembers = pgTable(
  "segment_members",
  {
    segmentId: typeId("segment_id", "segment")
      .references(() => segments.id, { onDelete: "cascade" })
      .notNull(),
    userId: typeId("user_id", "user")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    ...timestamps,
  },
  (table) => [unique().on(table.segmentId, table.userId)],
);

export const segmentFeatureFlags = pgTable(
  "segment_feature_flags",
  {
    id: typeId("id", "segment_feature_flag")
      .primaryKey()
      .$defaultFn(() => generateTypeId("segment_feature_flag").toString()),
    segmentId: typeId("segment_id", "segment")
      .references(() => segments.id, { onDelete: "cascade" })
      .notNull(),
    featureFlagId: typeId("feature_flag_id", "feature_flag")
      .references(() => featureFlags.id, { onDelete: "cascade" })
      .notNull(),
    value: json("value").notNull(),
    ...timestamps,
  },
  (table) => [unique().on(table.segmentId, table.featureFlagId)],
);

export type Segment = typeof segments.$inferSelect;
export type NewSegment = typeof segments.$inferInsert;

export type SegmentMember = typeof segmentMembers.$inferSelect;
export type NewSegmentMember = typeof segmentMembers.$inferInsert;

export type SegmentFeatureFlag = typeof segmentFeatureFlags.$inferSelect;
export type NewSegmentFeatureFlag = typeof segmentFeatureFlags.$inferInsert;
