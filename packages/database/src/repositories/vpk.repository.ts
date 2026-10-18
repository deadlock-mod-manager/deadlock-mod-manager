import { EntityNotFoundError } from "@deadlock-mods/common";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  type CachedVPK,
  type NewCachedVPK,
  type UningestedDownload,
  type UningestedDownloadQuery,
  type VpkIdentity,
  type VpkUpsertResult,
  vpk,
  vpkIngestions,
} from "../schema/vpk";

const isSameSource = (
  row: CachedVPK,
  identity: VpkIdentity,
  fileId: string,
  sourcePath: string,
) =>
  row.provider === identity.provider &&
  row.submissionType === identity.submissionType &&
  row.submissionId === identity.submissionId &&
  row.fileId === fileId &&
  row.sourcePath === sourcePath;

const isLegacyRowOf = (row: CachedVPK, identity: VpkIdentity) =>
  row.fileId === null &&
  row.provider === identity.provider &&
  row.submissionType === identity.submissionType &&
  row.submissionId === identity.submissionId;

/** GameBanana files Lockdex can index, aliased for use as the `c` CTE */
const indexableDownloads = (
  options: Omit<UningestedDownloadQuery, "limit">,
) => sql`
  SELECT
    CASE WHEN m.is_audio OR m.remote_id LIKE 'snd-%' THEN 'sound' ELSE 'mod' END AS "submissionType",
    regexp_replace(m.remote_id, '^snd-', '') AS "submissionId",
    d.remote_id AS "fileId",
    d.url,
    d.file,
    d.size,
    -- Ingestion markers come back through JS dates, so match at ms precision
    date_trunc('milliseconds', COALESCE(m.files_updated_at, d.created_at)) AS marker,
    m.download_count
  FROM mod_download d
  JOIN mod m ON m.id = d.mod_id
  WHERE NOT m.is_blacklisted
    AND NOT m.is_trashed
    AND d.size <= ${options.maxSizeBytes}
    AND d.file ~* ${`\\.(${options.extensions.join("|")})$`}
`;

const isIngested = sql`EXISTS (
  SELECT 1 FROM vpk_ingestion i
  WHERE i.provider = 'gamebanana'
    AND i.submission_type = c."submissionType"
    AND i.submission_id = c."submissionId"
    AND i.file_id = c."fileId"
    AND i.upstream_updated_at = c.marker
)`;

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

  /**
   * A sha256 has one row. When another file already owns it the row is left
   * alone and reported as a duplicate, except that a legacy row of the same
   * submission (written before file ids existed) is claimed by this file.
   */
  async upsertBySource(
    identity: VpkIdentity,
    fileId: string,
    sourcePath: string,
    vpkData: NewCachedVPK,
  ): Promise<VpkUpsertResult> {
    const values = { ...vpkData, ...identity, fileId, sourcePath };
    const owner = await this.findBySha256(vpkData.sha256);
    if (
      owner &&
      !isSameSource(owner, identity, fileId, sourcePath) &&
      !isLegacyRowOf(owner, identity)
    ) {
      return { vpk: owner, outcome: "duplicate" };
    }

    const existing =
      owner ?? (await this.findBySource(identity, fileId, sourcePath));
    if (existing) {
      const [updated] = await this.db
        .update(vpk)
        .set(values)
        .where(eq(vpk.id, existing.id))
        .returning();
      return { vpk: updated, outcome: "updated" };
    }

    const [created] = await this.db
      .insert(vpk)
      .values(values)
      .onConflictDoNothing({ target: vpk.sha256 })
      .returning();
    if (created) return { vpk: created, outcome: "created" };

    const racedOwner = await this.findBySha256(vpkData.sha256);
    if (!racedOwner) {
      throw new EntityNotFoundError(
        `VPK ${vpkData.sha256} vanished after an insert conflict`,
      );
    }
    return { vpk: racedOwner, outcome: "duplicate" };
  }

  /**
   * GameBanana files whose current marker has no ingestion yet, submissions
   * with no indexed VPK first, then the most downloaded.
   */
  async findUningestedDownloads(
    options: UningestedDownloadQuery,
  ): Promise<UningestedDownload[]> {
    const result = await this.db.execute<UningestedDownload>(sql`
      WITH candidate AS (${indexableDownloads(options)})
      SELECT
        c."submissionType", c."submissionId", c."fileId", c.url, c.file, c.size,
        to_char(c.marker, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "upstreamUpdatedAt"
      FROM candidate c
      WHERE NOT ${isIngested}
      ORDER BY
        EXISTS (
          SELECT 1 FROM vpk v
          WHERE v.provider = 'gamebanana'
            AND v.submission_type = c."submissionType"
            AND v.submission_id = c."submissionId"
        ),
        c.download_count DESC
      LIMIT ${options.limit}
    `);
    return result.rows;
  }

  /** How many indexable GameBanana files have an ingestion at their current marker */
  async countIngestionCoverage(
    options: Omit<UningestedDownloadQuery, "limit">,
  ): Promise<{ indexable: number; ingested: number }> {
    const result = await this.db.execute<{
      indexable: string;
      ingested: string;
    }>(sql`
      WITH candidate AS (${indexableDownloads(options)})
      SELECT count(*) AS indexable, count(*) FILTER (WHERE ${isIngested}) AS ingested
      FROM candidate c
    `);
    const [row] = result.rows;
    return { indexable: Number(row.indexable), ingested: Number(row.ingested) };
  }

  /**
   * Copies the GameBanana identity onto VPKs that only reference the catalog,
   * mirroring migration 0055 for rows legacy writers add after it.
   * Legacy desktop compatibility: remove with the catalog retirement (#715).
   */
  async backfillLegacyIdentities(): Promise<number> {
    const result = await this.db.execute(sql`
      UPDATE "vpk" SET
        "provider" = 'gamebanana',
        "submission_type" = CASE WHEN "mod"."is_audio" OR "mod"."remote_id" LIKE 'snd-%' THEN 'sound' ELSE 'mod' END,
        "submission_id" = regexp_replace("mod"."remote_id", '^snd-', '')
      FROM "mod"
      WHERE "vpk"."mod_id" = "mod"."id"
        AND "vpk"."submission_id" IS NULL
        AND "mod"."remote_id" ~ '^(snd-)?[1-9][0-9]*$'
    `);
    return result.rowCount ?? 0;
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
