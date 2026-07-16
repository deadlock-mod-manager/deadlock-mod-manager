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
import { timestamps } from "./shared/timestamps";

export const quickAnswerAssetKindEnum = pgEnum("quick_answer_asset_kind", [
  "image",
  "video",
]);

export const quickAnswerTemplates = pgTable(
  "quick_answer_templates",
  {
    id: typeId("id", "quick_answer_templates")
      .primaryKey()
      .$defaultFn(() => generateId("quick_answer_templates").toString()),
    guildId: text("guild_id").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdByDiscordId: text("created_by_discord_id").notNull(),
    updatedByDiscordId: text("updated_by_discord_id").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    usageCount: integer("usage_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { mode: "date" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("quick_answer_templates_guild_slug_idx").on(
      table.guildId,
      table.slug,
    ),
    index("quick_answer_templates_guild_active_idx").on(
      table.guildId,
      table.isActive,
    ),
  ],
);

export const quickAnswerAssets = pgTable(
  "quick_answer_assets",
  {
    id: typeId("id", "quick_answer_assets")
      .primaryKey()
      .$defaultFn(() => generateId("quick_answer_assets").toString()),
    templateId: text("template_id")
      .notNull()
      .references(() => quickAnswerTemplates.id, { onDelete: "cascade" }),
    kind: quickAnswerAssetKindEnum("kind").notNull(),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id").notNull(),
    attachmentId: text("attachment_id").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sortOrder: integer("sort_order").notNull(),
    ...timestamps,
  },
  (table) => [
    index("quick_answer_assets_template_idx").on(table.templateId),
    uniqueIndex("quick_answer_assets_attachment_idx").on(table.attachmentId),
  ],
);

export type QuickAnswerTemplate = typeof quickAnswerTemplates.$inferSelect;
export type NewQuickAnswerTemplate = typeof quickAnswerTemplates.$inferInsert;
export type QuickAnswerAsset = typeof quickAnswerAssets.$inferSelect;
export type NewQuickAnswerAsset = typeof quickAnswerAssets.$inferInsert;
