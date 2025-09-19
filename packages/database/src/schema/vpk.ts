import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { type Mod, modDownloads, mods } from "./mods";
import { timestamps } from "./shared/timestamps";

export const vpkStateEnum = pgEnum("vpk_state", ["ok", "duplicate", "corrupt"]);

export const vpk = pgTable(
  "vpk",
  {
    id: typeId("id", "vpk")
      .primaryKey()
      .$defaultFn(() => generateId("vpk").toString()),
    modId: text("mod_id")
      .notNull()
      .references(() => mods.id, { onDelete: "cascade" }),
    modDownloadId: text("mod_download_id").references(() => modDownloads.id, {
      onDelete: "set null",
    }),
    sourcePath: text("source_path").notNull(), // e.g. "weapons_pack_dir.vpk" or "mods/weapons_pack_dir.vpk"
    sizeBytes: integer("size_bytes").notNull(),
    fastHash: text("fast_hash").notNull(), // xxhash64 hex (16 chars) or blake3 16/32
    sha256: text("sha256").notNull(), // 64 hex chars
    contentSig: text("content_sig").notNull(), // sha256 of sorted (path,size,crc32)
    vpkVersion: integer("vpk_version").notNull(), // 1/2 etc.
    fileCount: integer("file_count").notNull(),
    hasMultiparts: boolean("has_multiparts").notNull().default(false),
    hasInlineData: boolean("has_inline_data").notNull().default(false),
    merkleRoot: text("merkle_root"), // if you compute per-entry hashes
    state: vpkStateEnum("state").notNull().default("ok"),
    scannedAt: timestamp("scanned_at", { mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    fileMtime: timestamp("file_mtime", { mode: "date" }), // when on disk
    ...timestamps,
  },
  (table) => [
    // one VPK identity per whole file
    uniqueIndex("vpk_sha256_uk").on(table.sha256),

    // content-level identity across repackaged files (filename changes, same inner content)
    index("vpk_content_sig_idx").on(table.contentSig),

    // speed up “did we already parse this VPK in this download at this path?”
    uniqueIndex("vpk_src_uk").on(table.modDownloadId, table.sourcePath),

    // helpful for quick prefilter
    index("vpk_fast_size_idx").on(table.fastHash, table.sizeBytes),
  ],
);

export const vpkRelations = relations(vpk, ({ one }) => ({
  mod: one(mods, {
    fields: [vpk.modId],
    references: [mods.id],
  }),
  modDownload: one(modDownloads, {
    fields: [vpk.modDownloadId],
    references: [modDownloads.id],
  }),
}));

export type CachedVPK = typeof vpk.$inferSelect;
export type NewCachedVPK = typeof vpk.$inferInsert;
export type CachedVPKWithMod = CachedVPK & {
  mod: Mod;
};
