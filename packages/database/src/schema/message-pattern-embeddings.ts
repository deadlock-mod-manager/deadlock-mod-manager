import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  vector,
} from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { timestamps } from "./shared/timestamps";

export const patternTypeEnum = pgEnum("pattern_type", [
  "bug_report",
  "help_request",
]);

export const messagePatterns = pgTable(
  "message_patterns",
  {
    id: typeId("id", "message_patterns")
      .primaryKey()
      .$defaultFn(() => generateId("message_patterns").toString()),
    patternType: patternTypeEnum("pattern_type").notNull(),
    patternText: text("pattern_text").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    metadata: jsonb("metadata").$type<{
      source?: string;
      category?: string;
    }>(),
    ...timestamps,
  },
  (table) => [
    index("message_patterns_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
    index("message_patterns_pattern_type_idx").on(table.patternType),
  ],
);

export const triageKeywords = pgTable("triage_keywords", {
  id: typeId("id", "triage_keywords")
    .primaryKey()
    .$defaultFn(() => generateId("triage_keywords").toString()),
  keyword: text("keyword").notNull().unique(),
  ...timestamps,
});

export type MessagePattern = typeof messagePatterns.$inferSelect;
export type NewMessagePattern = typeof messagePatterns.$inferInsert;

export type TriageKeyword = typeof triageKeywords.$inferSelect;
export type NewTriageKeyword = typeof triageKeywords.$inferInsert;
