import { and, desc, eq, gte } from "drizzle-orm";
import type { Database } from "../client";
import type { NewRssItem, RssItem } from "../schema/rss-items";
import { rssItems } from "../schema/rss-items";

export class RssItemRepository {
  constructor(private readonly db: Database) {}

  async findAll(source?: string): Promise<RssItem[]> {
    const query = this.db
      .select()
      .from(rssItems)
      .orderBy(desc(rssItems.pubDate));

    if (source) {
      return await query.where(eq(rssItems.source, source));
    }

    return await query;
  }

  async findById(id: string): Promise<RssItem | null> {
    const result = await this.db
      .select()
      .from(rssItems)
      .where(eq(rssItems.id, id))
      .limit(1);
    return result.length > 0 ? result[0] : null;
  }

  async findByLink(
    link: string,
    source = "gamebanana",
  ): Promise<RssItem | null> {
    const result = await this.db
      .select()
      .from(rssItems)
      .where(and(eq(rssItems.link, link), eq(rssItems.source, source)))
      .limit(1);
    return result.length > 0 ? result[0] : null;
  }

  async findRecentItems(
    sinceDate: Date,
    source = "gamebanana",
  ): Promise<RssItem[]> {
    return await this.db
      .select()
      .from(rssItems)
      .where(and(eq(rssItems.source, source), gte(rssItems.pubDate, sinceDate)))
      .orderBy(desc(rssItems.pubDate));
  }

  async create(item: NewRssItem): Promise<RssItem> {
    const result = await this.db.insert(rssItems).values(item).returning();
    return result[0];
  }

  async createMany(items: NewRssItem[]): Promise<RssItem[]> {
    if (items.length === 0) return [];

    const result = await this.db.insert(rssItems).values(items).returning();
    return result;
  }

  async update(id: string, item: Partial<NewRssItem>): Promise<RssItem> {
    const result = await this.db
      .update(rssItems)
      .set({ ...item, updatedAt: new Date() })
      .where(eq(rssItems.id, id))
      .returning();
    return result[0];
  }

  async upsertByLink(
    item: NewRssItem,
  ): Promise<{ item: RssItem; isNew: boolean }> {
    const existing = await this.findByLink(item.link, item.source);

    if (existing) {
      const updated = await this.update(existing.id, item);
      return { item: updated, isNew: false };
    }

    const created = await this.create(item);
    return { item: created, isNew: true };
  }

  async upsertManyByLink(items: NewRssItem[]): Promise<{
    newItems: RssItem[];
    updatedItems: RssItem[];
    totalProcessed: number;
  }> {
    const newItems: RssItem[] = [];
    const updatedItems: RssItem[] = [];

    for (const item of items) {
      const { item: processedItem, isNew } = await this.upsertByLink(item);

      if (isNew) {
        newItems.push(processedItem);
      } else {
        updatedItems.push(processedItem);
      }
    }

    return {
      newItems,
      updatedItems,
      totalProcessed: items.length,
    };
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(rssItems).where(eq(rssItems.id, id));
  }

  async deleteByLink(link: string, source = "gamebanana"): Promise<void> {
    await this.db
      .delete(rssItems)
      .where(and(eq(rssItems.link, link), eq(rssItems.source, source)));
  }

  async exists(id: string): Promise<boolean> {
    const result = await this.db
      .select({ id: rssItems.id })
      .from(rssItems)
      .where(eq(rssItems.id, id))
      .limit(1);
    return result.length > 0;
  }

  async existsByLink(link: string, source = "gamebanana"): Promise<boolean> {
    const result = await this.db
      .select({ id: rssItems.id })
      .from(rssItems)
      .where(and(eq(rssItems.link, link), eq(rssItems.source, source)))
      .limit(1);
    return result.length > 0;
  }

  async getLatestPubDate(source = "gamebanana"): Promise<Date | null> {
    const result = await this.db
      .select({ pubDate: rssItems.pubDate })
      .from(rssItems)
      .where(eq(rssItems.source, source))
      .orderBy(desc(rssItems.pubDate))
      .limit(1);

    return result.length > 0 ? result[0].pubDate : null;
  }
}
