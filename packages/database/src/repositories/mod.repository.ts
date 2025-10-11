import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import type { Mod, NewMod } from "../schema/mods";
import { mods } from "../schema/mods";

export class ModRepository {
  constructor(private readonly db: Database) {}

  async findAll(): Promise<Mod[]> {
    return await this.db
      .select()
      .from(mods)
      .where(eq(mods.isBlacklisted, false))
      .orderBy(desc(mods.remoteUpdatedAt));
  }

  async findById(id: string): Promise<Mod | null> {
    const result = await this.db
      .select()
      .from(mods)
      .where(eq(mods.id, id))
      .limit(1);
    return result.length > 0 ? result[0] : null;
  }

  async findByRemoteId(remoteId: string): Promise<Mod | null> {
    const result = await this.db
      .select()
      .from(mods)
      .where(and(eq(mods.remoteId, remoteId), eq(mods.isBlacklisted, false)))
      .limit(1);
    return result.length > 0 ? result[0] : null;
  }

  async findByRemoteIdIncludingBlacklisted(
    remoteId: string,
  ): Promise<Mod | null> {
    const result = await this.db
      .select()
      .from(mods)
      .where(eq(mods.remoteId, remoteId))
      .limit(1);
    return result.length > 0 ? result[0] : null;
  }

  async create(mod: NewMod): Promise<Mod> {
    const result = await this.db.insert(mods).values(mod).returning();
    return result[0];
  }

  async update(id: string, mod: Partial<NewMod>): Promise<Mod> {
    const result = await this.db
      .update(mods)
      .set({ ...mod, updatedAt: new Date() })
      .where(eq(mods.id, id))
      .returning();
    return result[0];
  }

  async updateByRemoteId(remoteId: string, mod: Partial<NewMod>): Promise<Mod> {
    const result = await this.db
      .update(mods)
      .set({ ...mod, updatedAt: new Date() })
      .where(eq(mods.remoteId, remoteId))
      .returning();
    return result[0];
  }

  async upsertByRemoteId(mod: NewMod): Promise<Mod> {
    const existing = await this.findByRemoteId(mod.remoteId);

    if (existing) {
      return await this.updateByRemoteId(mod.remoteId, mod);
    }
    return await this.create(mod);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(mods).where(eq(mods.id, id));
  }

  async deleteByRemoteId(remoteId: string): Promise<void> {
    await this.db.delete(mods).where(eq(mods.remoteId, remoteId));
  }

  async exists(id: string): Promise<boolean> {
    const result = await this.db
      .select({ id: mods.id })
      .from(mods)
      .where(eq(mods.id, id))
      .limit(1);
    return result.length > 0;
  }

  async existsByRemoteId(remoteId: string): Promise<boolean> {
    const result = await this.db
      .select({ id: mods.id })
      .from(mods)
      .where(eq(mods.remoteId, remoteId))
      .limit(1);
    return result.length > 0;
  }

  async blacklistMod(
    remoteId: string,
    reason: string,
    blacklistedBy: string,
  ): Promise<Mod> {
    const result = await this.db
      .update(mods)
      .set({
        isBlacklisted: true,
        blacklistReason: reason,
        blacklistedAt: new Date(),
        blacklistedBy,
        updatedAt: new Date(),
      })
      .where(eq(mods.remoteId, remoteId))
      .returning();
    return result[0];
  }

  async unblacklistMod(remoteId: string): Promise<Mod> {
    const result = await this.db
      .update(mods)
      .set({
        isBlacklisted: false,
        blacklistReason: null,
        blacklistedAt: null,
        blacklistedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(mods.remoteId, remoteId))
      .returning();
    return result[0];
  }
}
