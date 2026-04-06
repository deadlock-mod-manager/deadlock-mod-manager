import { and, count, desc, eq, sql } from "@deadlock-mods/database";
import type { Database } from "../client";
import { mods } from "../schema/mods";
import { type NewReport, type Report, reports } from "../schema/reports";

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

  async getReportCount(modId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(reports)
      .where(eq(reports.modId, modId));
    return result?.count ?? 0;
  }

  async getRecentReports(
    limit = 50,
  ): Promise<Array<Report & { modName: string; modAuthor: string }>> {
    return this.db
      .select({
        id: reports.id,
        modId: reports.modId,
        reporterHardwareId: reports.reporterHardwareId,
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

  async deleteByModId(modId: string): Promise<number> {
    const result = await this.db
      .delete(reports)
      .where(eq(reports.modId, modId))
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

  async getModsWithReportCounts(): Promise<
    Array<{
      modId: string;
      modName: string;
      modAuthor: string;
      totalReports: number;
    }>
  > {
    return this.db
      .select({
        modId: mods.id,
        modName: mods.name,
        modAuthor: mods.author,
        totalReports: count(reports.id),
      })
      .from(mods)
      .leftJoin(reports, eq(mods.id, reports.modId))
      .groupBy(mods.id, mods.name, mods.author)
      .having(sql`count(${reports.id}) > 0`)
      .orderBy(desc(count(reports.id)));
  }
}
