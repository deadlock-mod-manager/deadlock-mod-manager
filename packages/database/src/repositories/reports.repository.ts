import { and, count, desc, eq } from "@deadlock-mods/database";
import type { Database } from "../client";
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
        id: reports.id,
        provider: reports.provider,
        submissionType: reports.submissionType,
        submissionId: reports.submissionId,
        reporterHardwareId: reports.reporterHardwareId,
        discordMessageId: reports.discordMessageId,
        createdAt: reports.createdAt,
        updatedAt: reports.updatedAt,
        modName: reports.modName,
        modAuthor: reports.modAuthor,
      })
      .from(reports)
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
    const rows = await this.db
      .select({
        provider: reports.provider,
        submissionType: reports.submissionType,
        submissionId: reports.submissionId,
        modName: reports.modName,
        modAuthor: reports.modAuthor,
        totalReports: count(reports.id),
      })
      .from(reports)
      .groupBy(
        reports.provider,
        reports.submissionType,
        reports.submissionId,
        reports.modName,
        reports.modAuthor,
      )
      .orderBy(desc(count(reports.id)));
    return rows.map((row) => ({
      modId:
        row.submissionType === "sound"
          ? `snd-${row.submissionId}`
          : row.submissionId,
      modName: row.modName,
      modAuthor: row.modAuthor,
      totalReports: row.totalReports,
    }));
  }
}
