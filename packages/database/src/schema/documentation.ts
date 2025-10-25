import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { timestamps } from "./shared/timestamps";

export const syncStatusEnum = pgEnum("sync_status", [
  "idle",
  "syncing",
  "error",
]);

export const documentationChunks = pgTable(
  "documentation_chunks",
  {
    id: typeId("id", "documentation_chunks")
      .primaryKey()
      .$defaultFn(() => generateId("documentation_chunks").toString()),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    metadata: jsonb("metadata").$type<{
      chunkIndex: number;
      startChar: number;
      endChar: number;
    }>(),
    ...timestamps,
  },
  (table) => [
    index("documentation_chunks_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const documentationSync = pgTable("documentation_sync", {
  id: typeId("id", "documentation_sync")
    .primaryKey()
    .$defaultFn(() => generateId("documentation_sync").toString()),
  lastSyncedAt: timestamp("last_synced_at", { mode: "date" }),
  contentHash: text("content_hash").notNull(),
  chunkCount: integer("chunk_count").notNull(),
  status: syncStatusEnum("status").notNull().default("idle"),
  errorMessage: text("error_message"),
  ...timestamps,
});

export type DocumentationChunk = typeof documentationChunks.$inferSelect;
export type NewDocumentationChunk = typeof documentationChunks.$inferInsert;

export type DocumentationSync = typeof documentationSync.$inferSelect;
export type NewDocumentationSync = typeof documentationSync.$inferInsert;
