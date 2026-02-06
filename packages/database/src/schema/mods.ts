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
import { timestamps } from "./shared/timestamps";

export const mods = pgTable(
  "mod",
  {
    id: typeId("id", "mod")
      .primaryKey()
      .$defaultFn(() => generateId("mod").toString()),
    remoteId: text("remote_id").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    remoteUrl: text("remote_url").notNull(),
    category: text("category").notNull(),
    likes: integer("likes").notNull().default(0),
    author: text("author").notNull(),
    downloadable: boolean("downloadable").notNull().default(false),
    remoteAddedAt: timestamp("remote_added_at", { mode: "date" }).notNull(),
    remoteUpdatedAt: timestamp("remote_updated_at", { mode: "date" }).notNull(),
    tags: text("tags").array().notNull(),
    images: text("images").array().notNull(),
    hero: text("hero"),
    isAudio: boolean("is_audio").notNull().default(false),
    audioUrl: text("audio_url"),
    downloadCount: integer("download_count").notNull().default(0),
    isNSFW: boolean("is_nsfw").notNull().default(false),
    isObsolete: boolean("is_obsolete").default(false),
    isBlacklisted: boolean("is_blacklisted").notNull().default(false),
    blacklistReason: text("blacklist_reason"),
    blacklistedAt: timestamp("blacklisted_at", { mode: "date" }),
    blacklistedBy: text("blacklisted_by"),
    ...timestamps,
  },
  (table) => [
    index("idx_mod_created_at").on(table.createdAt),
    index("idx_mod_updated_at").on(table.updatedAt),
    index("idx_mod_blacklisted_remote_updated").on(
      table.isBlacklisted,
      table.remoteUpdatedAt,
    ),
  ],
);

export const modDownloads = pgTable(
  "mod_download",
  {
    id: typeId("id", "mod_download")
      .primaryKey()
      .$defaultFn(() => generateId("mod_download").toString()),
    modId: text("mod_id")
      .notNull()
      .references(() => mods.id),
    remoteId: text("remote_id").notNull(),
    file: text("file").notNull(),
    url: text("url").notNull(),
    size: integer("size").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("mod_download_mod_id_remote_id_idx").on(
      table.modId,
      table.remoteId,
    ),
    index("idx_mod_download_created_at").on(table.createdAt),
  ],
);

export type Mod = typeof mods.$inferSelect;
export type NewMod = typeof mods.$inferInsert;

export type ModDownload = typeof modDownloads.$inferSelect;
export type NewModDownload = typeof modDownloads.$inferInsert;
