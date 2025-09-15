import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const mods = pgTable('mod', {
  id: text('id').primaryKey().default(sql`concat('mod_', gen_random_uuid())`),
  remoteId: text('remote_id').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  remoteUrl: text('remote_url').notNull(),
  category: text('category').notNull(),
  likes: integer('likes').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'date' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .notNull()
    .$defaultFn(() => new Date()),
  author: text('author').notNull(),
  downloadable: boolean('downloadable').notNull().default(false),
  remoteAddedAt: timestamp('remote_added_at', { mode: 'date' }).notNull(),
  remoteUpdatedAt: timestamp('remote_updated_at', { mode: 'date' }).notNull(),
  tags: text('tags').array().notNull(),
  images: text('images').array().notNull(),
  hero: text('hero'),
  isAudio: boolean('is_audio').notNull().default(false),
  audioUrl: text('audio_url'),
  downloadCount: integer('download_count').notNull().default(0),
  isNSFW: boolean('is_nsfw').notNull().default(false),
});

export const modDownloads = pgTable(
  'mod_download',
  {
    id: text('id')
      .primaryKey()
      .default(sql`concat('mod_download_', gen_random_uuid())`),
    modId: text('mod_id')
      .notNull()
      .references(() => mods.id),
    remoteId: text('remote_id').notNull(),
    file: text('file').notNull(),
    url: text('url').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    size: integer('size').notNull(),
  },
  (table) => [
    uniqueIndex('mod_download_mod_id_remote_id_idx').on(
      table.modId,
      table.remoteId
    ),
  ]
);

export type Mod = typeof mods.$inferSelect;
export type NewMod = typeof mods.$inferInsert;

export type ModDownload = typeof modDownloads.$inferSelect;
export type NewModDownload = typeof modDownloads.$inferInsert;

export const vpkStateEnum = pgEnum('vpk_state', ['ok', 'duplicate', 'corrupt']);

export const vpk = pgTable(
  'vpk',
  {
    id: text('id').primaryKey().default(sql`concat('vpk_', gen_random_uuid())`),

    // reference to the mod this VPK belongs to
    modId: text('mod_id')
      .notNull()
      .references(() => mods.id, { onDelete: 'cascade' }),

    // where we sourced this VPK from (zip/tar/loose file referenced by mod_download.file/url)
    modDownloadId: text('mod_download_id')
      .notNull()
      .references(() => modDownloads.id, { onDelete: 'cascade' }),

    // if the VPK was inside an archive, keep its internal path; else just the filename
    sourcePath: text('source_path').notNull(), // e.g. "weapons_pack_dir.vpk" or "mods/weapons_pack_dir.vpk"

    // core identity fields
    sizeBytes: integer('size_bytes').notNull(),
    fastHash: text('fast_hash').notNull(), // xxhash64 hex (16 chars) or blake3 16/32
    sha256: text('sha256').notNull(), // 64 hex chars
    contentSig: text('content_sig').notNull(), // sha256 of sorted (path,size,crc32)

    // useful metadata
    vpkVersion: integer('vpk_version').notNull(), // 1/2 etc.
    fileCount: integer('file_count').notNull(),
    hasMultiparts: boolean('has_multiparts').notNull().default(false),
    hasInlineData: boolean('has_inline_data').notNull().default(false),

    // optional advanced
    merkleRoot: text('merkle_root'), // if you compute per-entry hashes
    state: vpkStateEnum('state').notNull().default('ok'),

    // timestamps
    scannedAt: timestamp('scanned_at', { mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    fileMtime: timestamp('file_mtime', { mode: 'date' }), // when on disk
  },
  (table) => [
    // one VPK identity per whole file
    uniqueIndex('vpk_sha256_uk').on(table.sha256),

    // content-level identity across repackaged files (filename changes, same inner content)
    index('vpk_content_sig_idx').on(table.contentSig),

    // speed up “did we already parse this VPK in this download at this path?”
    uniqueIndex('vpk_src_uk').on(table.modDownloadId, table.sourcePath),

    // helpful for quick prefilter
    index('vpk_fast_size_idx').on(table.fastHash, table.sizeBytes),
  ]
);

export type ModDownloadVpk = typeof vpk.$inferSelect;
export type NewModDownloadVpk = typeof vpk.$inferInsert;
