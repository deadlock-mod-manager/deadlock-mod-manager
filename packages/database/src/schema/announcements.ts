import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { user } from "./auth";
import { timestamps } from "./shared/timestamps";

export const announcementStatusEnum = pgEnum("announcement_status", [
  "draft",
  "published",
  "archived",
]);

export const announcementCategoryEnum = pgEnum("announcement_category", [
  "maintenance",
  "downtime",
  "info",
]);

export const announcements = pgTable("announcement", {
  id: typeId("id", "announcement")
    .primaryKey()
    .$defaultFn(() => generateId("announcement").toString()),
  title: text("title").notNull(),
  content: text("content").notNull(),
  iconUrl: text("icon_url"),
  linkUrl: text("link_url"),
  linkLabel: text("link_label"),
  category: announcementCategoryEnum("category").notNull().default("info"),
  status: announcementStatusEnum("status").notNull().default("draft"),
  authorId: text("author_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  publishedAt: timestamp("published_at", { mode: "date" }),
  ...timestamps,
});

export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
