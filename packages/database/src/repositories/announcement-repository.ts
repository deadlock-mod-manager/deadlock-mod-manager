import { desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import type { Announcement, NewAnnouncement } from "../schema/announcements";
import { announcements } from "../schema/announcements";

export class AnnouncementRepository {
  constructor(private readonly db: Database) {}

  async findAll(): Promise<Announcement[]> {
    return await this.db
      .select()
      .from(announcements)
      .orderBy(desc(announcements.createdAt));
  }

  async findPublished(): Promise<Announcement[]> {
    return await this.db
      .select()
      .from(announcements)
      .where(eq(announcements.status, "published"))
      .orderBy(desc(announcements.publishedAt));
  }

  async findById(id: string): Promise<Announcement | null> {
    const result = await this.db
      .select()
      .from(announcements)
      .where(eq(announcements.id, id))
      .limit(1);
    return result.length > 0 ? result[0] : null;
  }

  async create(announcement: NewAnnouncement): Promise<Announcement> {
    const result = await this.db
      .insert(announcements)
      .values(announcement)
      .returning();
    return result[0];
  }

  async update(
    id: string,
    updates: Partial<NewAnnouncement>,
  ): Promise<Announcement> {
    const result = await this.db
      .update(announcements)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(announcements.id, id))
      .returning();
    return result[0];
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(announcements).where(eq(announcements.id, id));
  }

  async publish(id: string): Promise<Announcement> {
    const result = await this.db
      .update(announcements)
      .set({
        status: "published",
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(announcements.id, id))
      .returning();
    return result[0];
  }

  async archive(id: string): Promise<Announcement> {
    const result = await this.db
      .update(announcements)
      .set({
        status: "archived",
        updatedAt: new Date(),
      })
      .where(eq(announcements.id, id))
      .returning();
    return result[0];
  }

  async exists(id: string): Promise<boolean> {
    const result = await this.db
      .select({ id: announcements.id })
      .from(announcements)
      .where(eq(announcements.id, id))
      .limit(1);
    return result.length > 0;
  }
}
