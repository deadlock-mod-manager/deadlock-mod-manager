import { RuntimeError } from "@deadlock-mods/common";
import { and, count, desc, eq, getTableColumns, sql } from "drizzle-orm";
import type { Database } from "../client";
import { mods } from "../schema/mods";
import { type NewReport, type Report, reports } from "../schema/reports";

export interface ReportIdentity {
  provider: "gamebanana";
  submissionType: "mod" | "sound";
  submissionId: string;
}

const identityPredicate = (identity: ReportIdentity) =>
  and(
    eq(reports.provider, identity.provider),
    eq(reports.submissionType, identity.submissionType),
    eq(reports.submissionId, identity.submissionId),
  );

export class ReportRepository {
  constructor(private db: Database) {}

  async create(data: NewReport): Promise<Report> {
    const [report] = await this.db.insert(reports).values(data).returning();
    return report;
  }

  async findById(id: string): Promise<Report | null> {
    const [report] = await this.db
      .select()
      .from(reports)
      .where(eq(reports.id, id))
      .limit(1);
    return report || null;
  }

  async findByIdentity(identity: ReportIdentity): Promise<Report[]> {
    return this.db
      .select()
      .from(reports)
      .where(identityPredicate(identity))
      .orderBy(desc(reports.createdAt));
  }

  async findByIdentityAndReporter(
    identity: ReportIdentity,
    reporterHardwareId: string,
  ): Promise<Report | null> {
    const [report] = await this.db
      .select()
      .from(reports)
      .where(
        and(
          identityPredicate(identity),
          eq(reports.reporterHardwareId, reporterHardwareId),
        ),
      )
      .limit(1);
    return report || null;
  }

  async getReportCount(identity: ReportIdentity): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(reports)
      .where(identityPredicate(identity));
    return result?.count ?? 0;
  }

  async getRecentReports(limit = 50): Promise<Report[]> {
    return this.db
      .select({
        ...getTableColumns(reports),
        modName: sql<string | null>`coalesce(${reports.modName}, ${mods.name})`,
        modAuthor: sql<
          string | null
        >`coalesce(${reports.modAuthor}, ${mods.author})`,
      })
      .from(reports)
      .leftJoin(mods, eq(reports.modId, mods.id))
      .orderBy(desc(reports.createdAt))
      .limit(limit);
  }

  async deleteByIdentity(identity: ReportIdentity): Promise<number> {
    const result = await this.db
      .delete(reports)
      .where(identityPredicate(identity))
      .returning({ id: reports.id });
    return result.length;
  }

  /**
   * Copies the GameBanana identity onto reports that only reference the
   * catalog, mirroring migration 0055 for rows legacy writers add after it.
   * Legacy desktop compatibility: remove with the catalog retirement (#715).
   */
  async backfillLegacyIdentities(): Promise<number> {
    const result = await this.db.execute(sql`
      UPDATE "report" SET
        "provider" = 'gamebanana',
        "submission_type" = CASE WHEN "mod"."is_audio" OR "mod"."remote_id" LIKE 'snd-%' THEN 'sound' ELSE 'mod' END,
        "submission_id" = regexp_replace("mod"."remote_id", '^snd-', ''),
        "mod_name" = COALESCE("report"."mod_name", "mod"."name"),
        "mod_author" = COALESCE("report"."mod_author", "mod"."author")
      FROM "mod"
      WHERE "report"."mod_id" = "mod"."id"
        AND "report"."submission_id" IS NULL
        AND "mod"."remote_id" ~ '^(snd-)?[1-9][0-9]*$'
    `);
    return result.rowCount ?? 0;
  }

  async updateDiscordMessageId(
    id: string,
    discordMessageId: string,
  ): Promise<Report | null> {
    const [report] = await this.db
      .update(reports)
      .set({
        discordMessageId,
        updatedAt: new Date(),
      })
      .where(eq(reports.id, id))
      .returning();

    return report || null;
  }

  async getSubmissionsWithReportCounts(): Promise<
    Array<{
      modId: string;
      modName: string;
      modAuthor: string;
      totalReports: number;
    }>
  > {
    const modId = sql<string | null>`coalesce(
      case when ${reports.submissionType} = 'sound'
        then 'snd-' || ${reports.submissionId}
        else ${reports.submissionId} end,
      ${reports.modId}
    )`;
    const modName = sql<
      string | null
    >`coalesce(${reports.modName}, ${mods.name})`;
    const modAuthor = sql<
      string | null
    >`coalesce(${reports.modAuthor}, ${mods.author})`;
    const rows = await this.db
      .select({
        modId,
        modName,
        modAuthor,
        totalReports: count(reports.id),
      })
      .from(reports)
      .leftJoin(mods, eq(reports.modId, mods.id))
      .groupBy(modId, modName, modAuthor)
      .orderBy(desc(count(reports.id)));
    return rows.map((row) => {
      if (
        row.modId === null ||
        row.modName === null ||
        row.modAuthor === null
      ) {
        throw new RuntimeError(
          "Report is missing both submission metadata and a legacy mod",
        );
      }
      return {
        modId: row.modId,
        modName: row.modName,
        modAuthor: row.modAuthor,
        totalReports: row.totalReports,
      };
    });
  }
}
