import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { mods } from "../schema/mods";
import {
  type NewReport,
  type Report,
  type ReportStatus,
  reports,
} from "../schema/reports";

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

  async findByModId(modId: string): Promise<Report[]> {
    return this.db
      .select()
      .from(reports)
      .where(eq(reports.modId, modId))
      .orderBy(desc(reports.createdAt));
  }

  async findByModIdAndReporter(
    modId: string,
    reporterHardwareId: string,
  ): Promise<Report | null> {
    const [report] = await this.db
      .select()
      .from(reports)
      .where(
        and(
          eq(reports.modId, modId),
          eq(reports.reporterHardwareId, reporterHardwareId),
        ),
      )
      .limit(1);
    return report || null;
  }

  async getReportCounts(modId: string): Promise<{
    total: number;
    verified: number;
    unverified: number;
    dismissed: number;
  }> {
    const result = await this.db
      .select({
        status: reports.status,
        count: count(),
      })
      .from(reports)
      .where(eq(reports.modId, modId))
      .groupBy(reports.status);

    const counts = {
      total: 0,
      verified: 0,
      unverified: 0,
      dismissed: 0,
    };

    for (const row of result) {
      counts.total += row.count;
      counts[row.status] = row.count;
    }

    return counts;
  }

  async getRecentReports(
    limit = 50,
  ): Promise<Array<Report & { modName: string; modAuthor: string }>> {
    return this.db
      .select({
        id: reports.id,
        modId: reports.modId,
        type: reports.type,
        status: reports.status,
        reason: reports.reason,
        description: reports.description,
        reporterHardwareId: reports.reporterHardwareId,
        verifiedBy: reports.verifiedBy,
        verifiedAt: reports.verifiedAt,
        dismissedBy: reports.dismissedBy,
        dismissedAt: reports.dismissedAt,
        dismissalReason: reports.dismissalReason,
        discordMessageId: reports.discordMessageId,
        createdAt: reports.createdAt,
        updatedAt: reports.updatedAt,
        modName: mods.name,
        modAuthor: mods.author,
      })
      .from(reports)
      .innerJoin(mods, eq(reports.modId, mods.id))
      .orderBy(desc(reports.createdAt))
      .limit(limit);
  }

  async updateStatus(
    id: string,
    status: ReportStatus,
    metadata: {
      verifiedBy?: string;
      dismissedBy?: string;
      dismissalReason?: string;
    } = {},
  ): Promise<Report | null> {
    const updateData: Partial<Report> = {
      status,
      updatedAt: new Date(),
    };

    if (status === "verified" && metadata.verifiedBy) {
      updateData.verifiedBy = metadata.verifiedBy;
      updateData.verifiedAt = new Date();
    }

    if (status === "dismissed" && metadata.dismissedBy) {
      updateData.dismissedBy = metadata.dismissedBy;
      updateData.dismissedAt = new Date();
      updateData.dismissalReason = metadata.dismissalReason;
    }

    const [report] = await this.db
      .update(reports)
      .set(updateData)
      .where(eq(reports.id, id))
      .returning();

    return report || null;
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

  async getModsWithReportCounts(): Promise<
    Array<{
      modId: string;
      modName: string;
      modAuthor: string;
      totalReports: number;
      verifiedReports: number;
      unverifiedReports: number;
    }>
  > {
    return this.db
      .select({
        modId: mods.id,
        modName: mods.name,
        modAuthor: mods.author,
        totalReports: count(reports.id),
        verifiedReports: sql<number>`count(case when ${reports.status} = 'verified' then 1 end)`,
        unverifiedReports: sql<number>`count(case when ${reports.status} = 'unverified' then 1 end)`,
      })
      .from(mods)
      .leftJoin(reports, eq(mods.id, reports.modId))
      .groupBy(mods.id, mods.name, mods.author)
      .having(sql`count(${reports.id}) > 0`)
      .orderBy(desc(sql`count(${reports.id})`));
  }
}
