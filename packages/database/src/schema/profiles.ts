import { index, json, pgTable, text } from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { timestamps } from "./shared/timestamps";

export const profiles = pgTable(
  "profile",
  {
    id: typeId("id", "profile")
      .primaryKey()
      .$defaultFn(() => generateId("profile").toString()),
    hardwareId: text("hardware_id").notNull(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    contentHash: text("content_hash").notNull(),
    profile: json().$type<{
      version: string;
      payload: unknown; // This will be validated by the shared schema
    }>(),
    ...timestamps,
  },
  (table) => [index("profiles_content_hash_idx").on(table.contentHash)],
);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
