import { and, eq } from "@deadlock-mods/database";
import type { Database } from "../client";
import type { CachedVPK, CachedVPKWithMod, NewCachedVPK } from "../schema/vpk";
import { vpk } from "../schema/vpk";

export class VpkRepository {
  constructor(private readonly db: Database) {}

  async findAll(): Promise<CachedVPKWithMod[]> {
    return (await this.db.query.vpk.findMany({
      with: {
        mod: true,
      },
    })) as CachedVPKWithMod[];
  }

  async findById(id: string): Promise<CachedVPK | null> {
    return (
      (await this.db.query.vpk.findFirst({
        where: eq(vpk.id, id),
        with: {
          mod: true,
        },
      })) ?? null
    );
  }

  async findByModDownloadId(modDownloadId: string): Promise<CachedVPK[]> {
    return await this.db.query.vpk.findMany({
      where: eq(vpk.modDownloadId, modDownloadId),
      with: {
        mod: true,
      },
    });
  }

  async findByModId(modId: string): Promise<CachedVPK[]> {
    return await this.db.query.vpk.findMany({
      where: eq(vpk.modId, modId),
      with: {
        mod: true,
      },
    });
  }

  async findBySha256(sha256: string): Promise<CachedVPKWithMod | null> {
    return ((await this.db.query.vpk.findFirst({
      where: eq(vpk.sha256, sha256),
      with: {
        mod: true,
      },
    })) ?? null) as CachedVPKWithMod | null;
  }

  async findByContentSignature(
    contentSig: string,
  ): Promise<CachedVPKWithMod[]> {
    return (await this.db.query.vpk.findMany({
      where: eq(vpk.contentSig, contentSig),
      with: {
        mod: true,
      },
    })) as CachedVPKWithMod[];
  }

  async findByMerkleRoot(merkleRoot: string): Promise<CachedVPKWithMod[]> {
    return (await this.db.query.vpk.findMany({
      where: eq(vpk.merkleRoot, merkleRoot),
      with: {
        mod: true,
      },
    })) as CachedVPKWithMod[];
  }

  async findByModDownloadIdAndSourcePath(
    modDownloadId: string,
    sourcePath: string,
  ): Promise<CachedVPK | null> {
    return (
      (await this.db.query.vpk.findFirst({
        where: and(
          eq(vpk.modDownloadId, modDownloadId),
          eq(vpk.sourcePath, sourcePath),
        ),
        with: {
          mod: true,
        },
      })) ?? null
    );
  }

  async findByFastHashAndSize(
    fastHash: string,
    sizeBytes: number,
  ): Promise<CachedVPKWithMod[]> {
    return (await this.db.query.vpk.findMany({
      where: and(eq(vpk.fastHash, fastHash), eq(vpk.sizeBytes, sizeBytes)),
      with: {
        mod: true,
      },
    })) as CachedVPKWithMod[];
  }

  async create(newVpk: NewCachedVPK): Promise<CachedVPK> {
    const result = await this.db.insert(vpk).values(newVpk).returning();
    return result[0];
  }

  async createMultiple(newVpks: NewCachedVPK[]): Promise<CachedVPK[]> {
    if (newVpks.length === 0) {
      return [];
    }

    const result = await this.db.insert(vpk).values(newVpks).returning();

    return result;
  }

  async update(id: string, vpkData: Partial<NewCachedVPK>): Promise<CachedVPK> {
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
    vpkData: NewCachedVPK,
  ): Promise<CachedVPK> {
    const existing = await this.findByModDownloadIdAndSourcePath(
      modDownloadId,
      sourcePath,
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
        `VPK insertion failed but no existing VPK found for SHA256: ${vpkData.sha256}`,
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
    const result = await this.db.query.vpk.findFirst({
      where: eq(vpk.id, id),
      columns: { id: true },
    });
    return result !== undefined;
  }

  async existsBySha256(sha256: string): Promise<boolean> {
    const result = await this.db.query.vpk.findFirst({
      where: eq(vpk.sha256, sha256),
      columns: { id: true },
    });
    return result !== undefined;
  }

  async existsByModDownloadIdAndSourcePath(
    modDownloadId: string,
    sourcePath: string,
  ): Promise<boolean> {
    const result = await this.db.query.vpk.findFirst({
      where: and(
        eq(vpk.modDownloadId, modDownloadId),
        eq(vpk.sourcePath, sourcePath),
      ),
      columns: { id: true },
    });
    return result !== undefined;
  }
}
