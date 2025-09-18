import { and, eq } from 'drizzle-orm';
import type { Database } from '../client';
import type { ModDownloadVpk, NewModDownloadVpk } from '../schema/mods';
import { vpk } from '../schema/mods';

export class VpkRepository {
  constructor(private readonly db: Database) {}

  async findAll(): Promise<ModDownloadVpk[]> {
    return await this.db.select().from(vpk);
  }

  async findById(id: string): Promise<ModDownloadVpk | null> {
    const result = await this.db
      .select()
      .from(vpk)
      .where(eq(vpk.id, id))
      .limit(1);
    return result.length > 0 ? result[0] : null;
  }

  async findByModDownloadId(modDownloadId: string): Promise<ModDownloadVpk[]> {
    return await this.db
      .select()
      .from(vpk)
      .where(eq(vpk.modDownloadId, modDownloadId));
  }

  async findByModId(modId: string): Promise<ModDownloadVpk[]> {
    return await this.db.select().from(vpk).where(eq(vpk.modId, modId));
  }

  async findBySha256(sha256: string): Promise<ModDownloadVpk | null> {
    const result = await this.db
      .select()
      .from(vpk)
      .where(eq(vpk.sha256, sha256))
      .limit(1);
    return result.length > 0 ? result[0] : null;
  }

  async findByContentSignature(contentSig: string): Promise<ModDownloadVpk[]> {
    return await this.db
      .select()
      .from(vpk)
      .where(eq(vpk.contentSig, contentSig));
  }

  async findByModDownloadIdAndSourcePath(
    modDownloadId: string,
    sourcePath: string
  ): Promise<ModDownloadVpk | null> {
    const result = await this.db
      .select()
      .from(vpk)
      .where(
        and(
          eq(vpk.modDownloadId, modDownloadId),
          eq(vpk.sourcePath, sourcePath)
        )
      )
      .limit(1);
    return result.length > 0 ? result[0] : null;
  }

  async findByFastHashAndSize(
    fastHash: string,
    sizeBytes: number
  ): Promise<ModDownloadVpk[]> {
    return await this.db
      .select()
      .from(vpk)
      .where(and(eq(vpk.fastHash, fastHash), eq(vpk.sizeBytes, sizeBytes)));
  }

  async create(newVpk: NewModDownloadVpk): Promise<ModDownloadVpk> {
    const result = await this.db.insert(vpk).values(newVpk).returning();
    return result[0];
  }

  async createMultiple(
    newVpks: NewModDownloadVpk[]
  ): Promise<ModDownloadVpk[]> {
    if (newVpks.length === 0) {
      return [];
    }

    const result = await this.db.insert(vpk).values(newVpks).returning();

    return result;
  }

  async update(
    id: string,
    vpkData: Partial<NewModDownloadVpk>
  ): Promise<ModDownloadVpk> {
    const result = await this.db
      .update(vpk)
      .set(vpkData)
      .where(eq(vpk.id, id))
      .returning();
    return result[0];
  }

  async upsertByModDownloadIdAndSourcePath(
    modDownloadId: string,
    sourcePath: string,
    vpkData: NewModDownloadVpk
  ): Promise<ModDownloadVpk> {
    const existing = await this.findByModDownloadIdAndSourcePath(
      modDownloadId,
      sourcePath
    );

    if (existing) {
      return await this.update(existing.id, vpkData);
    }

    const result = await this.db
      .insert(vpk)
      .values({
        ...vpkData,
        modDownloadId,
        sourcePath,
      })
      .onConflictDoNothing({ target: vpk.sha256 })
      .returning();

    if (result.length > 0) {
      return result[0];
    }

    const existingBySha256 = await this.findBySha256(vpkData.sha256);
    if (!existingBySha256) {
      throw new Error(
        `VPK insertion failed but no existing VPK found for SHA256: ${vpkData.sha256}`
      );
    }

    return existingBySha256;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(vpk).where(eq(vpk.id, id));
  }

  async deleteByModDownloadId(modDownloadId: string): Promise<void> {
    await this.db.delete(vpk).where(eq(vpk.modDownloadId, modDownloadId));
  }

  async deleteByModId(modId: string): Promise<void> {
    await this.db.delete(vpk).where(eq(vpk.modId, modId));
  }

  async deleteBySha256(sha256: string): Promise<void> {
    await this.db.delete(vpk).where(eq(vpk.sha256, sha256));
  }

  async exists(id: string): Promise<boolean> {
    const result = await this.db
      .select({ id: vpk.id })
      .from(vpk)
      .where(eq(vpk.id, id))
      .limit(1);
    return result.length > 0;
  }

  async existsBySha256(sha256: string): Promise<boolean> {
    const result = await this.db
      .select({ id: vpk.id })
      .from(vpk)
      .where(eq(vpk.sha256, sha256))
      .limit(1);
    return result.length > 0;
  }

  async existsByModDownloadIdAndSourcePath(
    modDownloadId: string,
    sourcePath: string
  ): Promise<boolean> {
    const result = await this.db
      .select({ id: vpk.id })
      .from(vpk)
      .where(
        and(
          eq(vpk.modDownloadId, modDownloadId),
          eq(vpk.sourcePath, sourcePath)
        )
      )
      .limit(1);
    return result.length > 0;
  }
}
