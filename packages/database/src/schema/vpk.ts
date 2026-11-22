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
import { modDownloads, mods } from "./mods";
import { policyProviders, policySubmissionTypes } from "./policy-rules";
import { timestamps } from "./shared/timestamps";

export const vpkStateEnum = pgEnum("vpk_state", ["ok", "duplicate", "corrupt"]);

export const vpk = pgTable(
  "vpk",
  {
    id: typeId("id", "vpk")
      .primaryKey()
      .$defaultFn(() => generateId("vpk").toString()),
    modId: text("mod_id").references(() => mods.id, { onDelete: "cascade" }),
    modDownloadId: text("mod_download_id").references(() => modDownloads.id, {
      onDelete: "set null",
    }),
    provider: text("provider", { enum: policyProviders }),
    submissionType: text("submission_type", {
      enum: policySubmissionTypes,
    }),
    submissionId: text("submission_id"),
    fileId: text("file_id"),
    upstreamUpdatedAt: timestamp("upstream_updated_at", {
      mode: "date",
    }),
    sourcePath: text("source_path").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    fastHash: text("fast_hash").notNull(),
    sha256: text("sha256").notNull(),
    contentSig: text("content_sig").notNull(),
    vpkVersion: integer("vpk_version").notNull(),
    fileCount: integer("file_count").notNull(),
    hasMultiparts: boolean("has_multiparts").notNull().default(false),
    hasInlineData: boolean("has_inline_data").notNull().default(false),
    merkleRoot: text("merkle_root"),
    state: vpkStateEnum("state").notNull().default("ok"),
    scannedAt: timestamp("scanned_at", { mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    fileMtime: timestamp("file_mtime", { mode: "date" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("vpk_sha256_uk").on(table.sha256),

    index("vpk_content_sig_idx").on(table.contentSig),

    uniqueIndex("vpk_src_uk").on(table.modDownloadId, table.sourcePath),
    index("vpk_identity_source_idx").on(
      table.provider,
      table.submissionType,
      table.submissionId,
      table.fileId,
      table.sourcePath,
    ),

    index("vpk_fast_size_idx").on(table.fastHash, table.sizeBytes),
  ],
);

export const vpkIngestions = pgTable(
  "vpk_ingestion",
  {
    id: typeId("id", "vpk_ingestion")
      .primaryKey()
      .$defaultFn(() => generateId("vpk_ingestion").toString()),
    provider: text("provider", { enum: policyProviders }).notNull(),
    submissionType: text("submission_type", {
      enum: policySubmissionTypes,
    }).notNull(),
    submissionId: text("submission_id").notNull(),
    fileId: text("file_id").notNull(),
    upstreamUpdatedAt: timestamp("upstream_updated_at", {
      mode: "date",
    }).notNull(),
    completedAt: timestamp("completed_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("vpk_ingestion_identity_file_marker_idx").on(
      table.provider,
      table.submissionType,
      table.submissionId,
      table.fileId,
      table.upstreamUpdatedAt,
    ),
  ],
);

export type CachedVPK = typeof vpk.$inferSelect;
export type NewCachedVPK = typeof vpk.$inferInsert;
export type VpkIngestion = typeof vpkIngestions.$inferSelect;

export interface VpkIdentity {
  provider: "gamebanana";
  submissionType: "mod" | "sound";
  submissionId: string;
}

export interface VpkUpsertResult {
  vpk: CachedVPK;
  outcome: "created" | "updated" | "duplicate";
}

export interface UningestedDownloadQuery {
  limit: number;
  maxSizeBytes: number;
  extensions: string[];
}

export type UningestedDownload = {
  submissionType: VpkIdentity["submissionType"];
  submissionId: string;
  fileId: string;
  url: string;
  file: string;
  size: number;
  upstreamUpdatedAt: string;
};
