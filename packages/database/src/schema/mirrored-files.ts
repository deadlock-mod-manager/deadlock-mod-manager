import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { modDownloads, mods } from "./mods";
import { timestamps } from "./shared/timestamps";

export const mirroredFiles = pgTable(
  "mirrored_files",
  {
    id: typeId("id", "mirrored_files")
      .primaryKey()
      .$defaultFn(() => generateId("mirrored_files").toString()),
    modDownloadId: text("mod_download_id")
      .notNull()
      .references(() => modDownloads.id, { onDelete: "cascade" }),
    modId: text("mod_id")
      .notNull()
      .references(() => mods.id, { onDelete: "cascade" }),
    remoteId: text("remote_id").notNull(),
    filename: text("filename").notNull(),
    s3Key: text("s3_key").notNull(),
    s3Bucket: text("s3_bucket").notNull(),
    fileHash: text("file_hash").unique(),
    fileSize: integer("file_size").notNull(),
    mirroredAt: timestamp("mirrored_at", { mode: "date" }).notNull(),
    lastDownloadedAt: timestamp("last_downloaded_at", {
      mode: "date",
    }),
    lastValidated: timestamp("last_validated", {
      mode: "date",
    }),
    isStale: boolean("is_stale").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("idx_mirrored_files_mod_download_id_and_mod_id").on(
      t.modDownloadId,
      t.modId,
    ),
    index("idx_mirrored_files_last_downloaded_at").on(t.lastDownloadedAt),
    index("idx_mirrored_files_is_stale").on(t.isStale),
    uniqueIndex("unique_mod_download_id_and_mod_id").on(
      t.modDownloadId,
      t.modId,
    ),
  ],
);

export type MirroredFile = typeof mirroredFiles.$inferSelect;
export type NewMirroredFile = typeof mirroredFiles.$inferInsert;
