import { and, eq } from "@deadlock-mods/database";
import type { Database } from "../client";
import {
  type CachedVPK,
  type NewCachedVPK,
  type VpkIdentity,
  vpk,
  vpkIngestions,
} from "../schema/vpk";

const identityPredicate = (identity: VpkIdentity) =>
  and(
    eq(vpk.provider, identity.provider),
    eq(vpk.submissionType, identity.submissionType),
    eq(vpk.submissionId, identity.submissionId),
  );

export class VpkRepository {
  constructor(private readonly db: Database) {}

  async findAll(): Promise<CachedVPK[]> {
    return await this.db.select().from(vpk);
  }

  async findById(id: string): Promise<CachedVPK | null> {
    const [entry] = await this.db
      .select()
      .from(vpk)
      .where(eq(vpk.id, id))
      .limit(1);
    return entry ?? null;
  }

  async findBySha256(sha256: string): Promise<CachedVPK | null> {
    const [entry] = await this.db
      .select()
      .from(vpk)
      .where(eq(vpk.sha256, sha256))
      .limit(1);
    return entry ?? null;
  }

  async findByContentSignature(contentSig: string): Promise<CachedVPK[]> {
    return await this.db
      .select()
      .from(vpk)
      .where(eq(vpk.contentSig, contentSig));
  }

  async findByMerkleRoot(merkleRoot: string): Promise<CachedVPK[]> {
    return await this.db
      .select()
      .from(vpk)
      .where(eq(vpk.merkleRoot, merkleRoot));
  }

  async findByFastHashAndSize(
    fastHash: string,
    sizeBytes: number,
  ): Promise<CachedVPK[]> {
    return await this.db
      .select()
      .from(vpk)
      .where(and(eq(vpk.fastHash, fastHash), eq(vpk.sizeBytes, sizeBytes)));
  }

  async findBySource(
    identity: VpkIdentity,
    fileId: string,
    sourcePath: string,
  ): Promise<CachedVPK | null> {
    const [entry] = await this.db
      .select()
      .from(vpk)
      .where(
        and(
          identityPredicate(identity),
          eq(vpk.fileId, fileId),
          eq(vpk.sourcePath, sourcePath),
        ),
      )
      .limit(1);
    return entry ?? null;
  }

  async upsertBySource(
    identity: VpkIdentity,
    fileId: string,
    sourcePath: string,
    vpkData: NewCachedVPK,
  ): Promise<CachedVPK> {
    const existing = await this.findBySource(identity, fileId, sourcePath);
    if (existing) {
      const [updated] = await this.db
        .update(vpk)
        .set(vpkData)
        .where(eq(vpk.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await this.db
      .insert(vpk)
      .values({ ...vpkData, ...identity, fileId, sourcePath })
      .returning();
    return created;
  }

  async isIngestionComplete(
    identity: VpkIdentity,
    fileId: string,
    upstreamUpdatedAt: Date,
  ): Promise<boolean> {
    const [entry] = await this.db
      .select({ id: vpkIngestions.id })
      .from(vpkIngestions)
      .where(
        and(
          eq(vpkIngestions.provider, identity.provider),
          eq(vpkIngestions.submissionType, identity.submissionType),
          eq(vpkIngestions.submissionId, identity.submissionId),
          eq(vpkIngestions.fileId, fileId),
          eq(vpkIngestions.upstreamUpdatedAt, upstreamUpdatedAt),
        ),
      )
      .limit(1);
    return entry !== undefined;
  }

  async markIngestionComplete(
    identity: VpkIdentity,
    fileId: string,
    upstreamUpdatedAt: Date,
  ): Promise<void> {
    await this.db
      .insert(vpkIngestions)
      .values({ ...identity, fileId, upstreamUpdatedAt })
      .onConflictDoNothing();
  }
}
