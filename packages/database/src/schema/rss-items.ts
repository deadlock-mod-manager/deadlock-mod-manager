import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { timestamps } from "./shared/timestamps";

export const rssItems = pgTable(
  "rss_item",
  {
    id: typeId("id", "rss_item")
      .primaryKey()
      .$defaultFn(() => generateId("rss_item").toString()),
    title: text("title").notNull(),
    link: text("link").notNull(),
    pubDate: timestamp("pub_date", { mode: "date" }).notNull(),
    image: text("image"),
    guid: text("guid"),
    source: text("source").notNull().default("gamebanana"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("rss_item_link_source_idx").on(table.link, table.source),
    uniqueIndex("rss_item_pub_date_idx").on(table.pubDate),
  ],
);

export type RssItem = typeof rssItems.$inferSelect;
export type NewRssItem = typeof rssItems.$inferInsert;
