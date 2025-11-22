import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { Crosshair, NewCrosshair } from "../schema/crosshairs";
import { crosshairLikes, crosshairs } from "../schema/crosshairs";

export class CrosshairRepository {
  constructor(private readonly db: Database) {}

  async findAll() {
    return await this.db.query.crosshairs.findMany({
      with: {
        user: true,
      },
      orderBy: [desc(crosshairs.createdAt)],
    });
  }

  async findById(id: string): Promise<Crosshair | null> {
    const result = await this.db
      .select()
      .from(crosshairs)
      .where(eq(crosshairs.id, id))
      .limit(1);
    return result.length > 0 ? result[0] : null;
  }

  async findByUserId(userId: string): Promise<Crosshair[]> {
    return await this.db
      .select()
      .from(crosshairs)
      .where(eq(crosshairs.userId, userId))
      .orderBy(desc(crosshairs.createdAt));
  }

  async create(crosshair: NewCrosshair): Promise<Crosshair> {
    const result = await this.db
      .insert(crosshairs)
      .values(crosshair)
      .returning();
    return result[0];
  }

  async incrementDownloads(id: string): Promise<Crosshair> {
    const result = await this.db
      .update(crosshairs)
      .set({
        downloads: sql`${crosshairs.downloads} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(crosshairs.id, id))
      .returning();
    return result[0];
  }

  async getLikes(crosshairId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(crosshairLikes)
      .where(eq(crosshairLikes.crosshairId, crosshairId));
    return Number(result[0]?.count ?? 0);
  }

  async hasLiked(crosshairId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .select()
      .from(crosshairLikes)
      .where(
        and(
          eq(crosshairLikes.crosshairId, crosshairId),
          eq(crosshairLikes.userId, userId),
        ),
      )
      .limit(1);
    return result.length > 0;
  }

  async toggleLike(crosshairId: string, userId: string): Promise<boolean> {
    const hasLiked = await this.hasLiked(crosshairId, userId);

    if (hasLiked) {
      await this.db
        .delete(crosshairLikes)
        .where(
          and(
            eq(crosshairLikes.crosshairId, crosshairId),
            eq(crosshairLikes.userId, userId),
          ),
        );
      await this.db
        .update(crosshairs)
        .set({
          likes: sql`${crosshairs.likes} - 1`,
          updatedAt: new Date(),
        })
        .where(eq(crosshairs.id, crosshairId));
      return false;
    }

    await this.db.insert(crosshairLikes).values({
      crosshairId,
      userId,
    });
    await this.db
      .update(crosshairs)
      .set({
        likes: sql`${crosshairs.likes} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(crosshairs.id, crosshairId));
    return true;
  }
}
