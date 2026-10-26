import { index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { user } from "./auth";
import { timestamps } from "./shared/timestamps";

export const profileBackups = pgTable(
  "profile_backup",
  {
    id: typeId("id", "profile_backup")
      .primaryKey()
      .$defaultFn(() => generateId("profile_backup").toString()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    deviceName: text("device_name").notNull(),
    modCount: integer("mod_count").notNull(),
    skippedLocalModCount: integer("skipped_local_mod_count")
      .notNull()
      .default(0),
    contentHash: text("content_hash").notNull(),
    // Bumped on every save so a stale client can't overwrite a newer backup.
    revision: integer("revision").notNull().default(1),
    payload: jsonb("payload").notNull(),
    ...timestamps,
  },
  (table) => [index("idx_profile_backup_user_id").on(table.userId)],
);

export type ProfileBackupRow = typeof profileBackups.$inferSelect;
export type NewProfileBackupRow = typeof profileBackups.$inferInsert;
