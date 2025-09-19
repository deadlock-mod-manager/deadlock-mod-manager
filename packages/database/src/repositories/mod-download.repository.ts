import { eq } from "drizzle-orm";
import { type Database } from "../client";
import type { ModDownload, NewModDownload } from "../schema/mods";
import { modDownloads } from "../schema/mods";

export class ModDownloadRepository {
  constructor(private readonly db: Database) {}

  async findAll(): Promise<ModDownload[]> {
    return await this.db.select().from(modDownloads);
  }

  async findById(id: string): Promise<ModDownload | null> {
    const result = await this.db
      .select()
      .from(modDownloads)
      .where(eq(modDownloads.id, id))
      .limit(1);
    return result.length > 0 ? result[0] : null;
  }

  async findByModId(modId: string): Promise<ModDownload[]> {
    return await this.db
      .select()
      .from(modDownloads)
      .where(eq(modDownloads.modId, modId));
  }

  async findByRemoteId(remoteId: string): Promise<ModDownload | null> {
    const result = await this.db
      .select()
      .from(modDownloads)
      .where(eq(modDownloads.remoteId, remoteId))
      .limit(1);
    return result.length > 0 ? result[0] : null;
  }

  async create(modDownload: NewModDownload): Promise<ModDownload> {
    const result = await this.db
      .insert(modDownloads)
      .values(modDownload)
      .returning();
    return result[0];
  }

  async update(
    id: string,
    modDownload: Partial<NewModDownload>,
  ): Promise<ModDownload> {
    const result = await this.db
      .update(modDownloads)
      .set({ ...modDownload, updatedAt: new Date() })
      .where(eq(modDownloads.id, id))
      .returning();
    return result[0];
  }

  async updateByModId(
    modId: string,
    modDownload: Partial<NewModDownload>,
  ): Promise<ModDownload[]> {
    const result = await this.db
      .update(modDownloads)
      .set({ ...modDownload, updatedAt: new Date() })
      .where(eq(modDownloads.modId, modId))
      .returning();
    return result;
  }

  async upsertByModId(
    modId: string,
    modDownload: NewModDownload,
  ): Promise<ModDownload> {
    const existing = await this.findByModId(modId);

    if (existing.length > 0) {
      // Update the first existing download (assuming one download per mod)
      return await this.update(existing[0].id, modDownload);
    }
    return await this.create({ ...modDownload, modId });
  }

  async upsertMultipleByModId(
    modId: string,
    modDownloads: NewModDownload[],
  ): Promise<ModDownload[]> {
    // Delete existing downloads for this mod
    await this.deleteByModId(modId);

    // Create new downloads
    const results: ModDownload[] = [];
    for (const modDownload of modDownloads) {
      const created = await this.create({ ...modDownload, modId });
      results.push(created);
    }

    return results;
  }

  async createMultiple(
    newModDownloads: NewModDownload[],
  ): Promise<ModDownload[]> {
    if (newModDownloads.length === 0) {
      return [];
    }

    const result = await this.db
      .insert(modDownloads)
      .values(newModDownloads)
      .returning();

    return result;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(modDownloads).where(eq(modDownloads.id, id));
  }

  async deleteByModId(modId: string): Promise<void> {
    await this.db.delete(modDownloads).where(eq(modDownloads.modId, modId));
  }

  async deleteByRemoteId(remoteId: string): Promise<void> {
    await this.db
      .delete(modDownloads)
      .where(eq(modDownloads.remoteId, remoteId));
  }

  async exists(id: string): Promise<boolean> {
    const result = await this.db
      .select({ id: modDownloads.id })
      .from(modDownloads)
      .where(eq(modDownloads.id, id))
      .limit(1);
    return result.length > 0;
  }
}

