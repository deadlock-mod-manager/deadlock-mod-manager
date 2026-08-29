import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { timestamps } from "./shared/timestamps";

export interface ModOverrides {
  name?: string;
  description?: string;
  category?: string;
  hero?: string;
  isMap?: boolean;
  isAudio?: boolean;
  isNSFW?: boolean;
  isObsolete?: boolean;
  tags?: string[];
  metadata?: {
    mapName?: string;
    donationLinks?: Array<{ url: string; platform: string }>;
  };
  downloads?: Array<{ url: string; file: string }>;
}

export interface ModDependency {
  /** The text GameBanana shows */
  label: string;
  /** The link, if there is one */
  url: string | null;
  /** The other mod's id, if the link points at a GameBanana mod */
  remoteId: string | null;
  /** Required or recommended, if GameBanana says which */
  level: "required" | "recommended" | null;
}

export const modAuthors = pgTable(
  "mod_author",
  {
    id: typeId("id", "mod_author")
      .primaryKey()
      .$defaultFn(() => generateId("mod_author").toString()),
    provider: text("provider").notNull(),
    remoteId: text("remote_id").notNull(),
    name: text("name").notNull(),
    profileUrl: text("profile_url").notNull(),
    avatarUrl: text("avatar_url").notNull(),
    hdAvatarUrl: text("hd_avatar_url"),
    upicUrl: text("upic_url"),
    signatureUrl: text("signature_url"),
    title: text("title"),
    joinedAt: integer("joined_at"),
    subscriberCount: integer("subscriber_count"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("mod_author_provider_remote_id_idx").on(
      table.provider,
      table.remoteId,
    ),
  ],
);

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
    modAuthorId: text("mod_author_id").references(() => modAuthors.id),
    downloadable: boolean("downloadable").notNull().default(false),
    remoteAddedAt: timestamp("remote_added_at", { mode: "date" }).notNull(),
    remoteUpdatedAt: timestamp("remote_updated_at", { mode: "date" }).notNull(),
    tags: text("tags").array().notNull(),
    images: text("images").array().notNull(),
    hero: text("hero"),
    isAudio: boolean("is_audio").notNull().default(false),
    isMap: boolean("is_map").notNull().default(false),
    audioUrl: text("audio_url"),
    downloadCount: integer("download_count").notNull().default(0),
    isNSFW: boolean("is_nsfw").notNull().default(false),
    isObsolete: boolean("is_obsolete").default(false),
    isTrashed: boolean("is_trashed").notNull().default(false),
    isBlacklisted: boolean("is_blacklisted").notNull().default(false),
    blacklistReason: text("blacklist_reason"),
    blacklistedAt: timestamp("blacklisted_at", { mode: "date" }),
    blacklistedBy: text("blacklisted_by"),
    filesUpdatedAt: timestamp("files_updated_at", { mode: "date" }),
    metadata: jsonb("metadata").$type<{
      mapName?: string;
      donationLinks?: Array<{ url: string; platform: string }>;
    }>(),
    overrides: jsonb("overrides").$type<ModOverrides>(),
    dependencies: jsonb("dependencies").$type<ModDependency[]>(),
    ...timestamps,
  },
  (table) => [
    index("idx_mod_created_at").on(table.createdAt),
    index("idx_mod_updated_at").on(table.updatedAt),
    index("idx_mod_author_id").on(table.modAuthorId),
    index("idx_mod_blacklisted_remote_updated").on(
      table.isBlacklisted,
      table.remoteUpdatedAt,
    ),
    index("idx_mod_active_listing").on(
      table.isBlacklisted,
      table.isTrashed,
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
    description: text("description"),
    md5Checksum: text("md5_checksum"),
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

export type ModAuthor = typeof modAuthors.$inferSelect;
export type NewModAuthor = typeof modAuthors.$inferInsert;

export type ModDownload = typeof modDownloads.$inferSelect;
export type NewModDownload = typeof modDownloads.$inferInsert;
