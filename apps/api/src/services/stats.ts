import {
  count,
  db,
  gte,
  mods,
  schema,
  sql,
  sum,
  user,
} from "@deadlock-mods/database";
import type { StatsResponse } from "../types/stats";
import { GitHubReleasesService } from "./github-releases";

export class StatsService {
  private static instance: StatsService;

  private constructor() {}

  static getInstance(): StatsService {
    if (!StatsService.instance) {
      StatsService.instance = new StatsService();
    }
    return StatsService.instance;
  }

  async getStats(): Promise<StatsResponse> {
    const [modStats, releases] = await Promise.all([
      db
        .select({
          totalMods: count(mods.id),
          modDownloads: sum(mods.downloadCount),
        })
        .from(mods),
      GitHubReleasesService.getInstance().fetchReleases(),
    ]);

    const appDownloads = releases.allVersions.reduce((total, version) => {
      return (
        total +
        version.downloads.reduce(
          (versionTotal, download) => versionTotal + download.downloadCount,
          0,
        )
      );
    }, 0);

    return {
      totalMods: modStats[0].totalMods || 0,
      modDownloads: Number(modStats[0].modDownloads) || 0,
      appDownloads,
    };
  }

  async getAnalytics(hours: number | null = 2160) {
    let startDate: Date | null = null;
    if (hours !== null) {
      startDate = new Date();
      startDate.setHours(startDate.getHours() - hours);
    }

    const modsTimeSeriesQuery = startDate
      ? db
          .select({
            date: sql<string>`date_trunc('hour', ${mods.createdAt})`.as("date"),
            count: count(mods.id).as("count"),
          })
          .from(mods)
          .where(gte(mods.createdAt, startDate))
          .groupBy(sql`date_trunc('hour', ${mods.createdAt})`)
          .orderBy(sql`date_trunc('hour', ${mods.createdAt})`)
      : db
          .select({
            date: sql<string>`date_trunc('hour', ${mods.createdAt})`.as("date"),
            count: count(mods.id).as("count"),
          })
          .from(mods)
          .groupBy(sql`date_trunc('hour', ${mods.createdAt})`)
          .orderBy(sql`date_trunc('hour', ${mods.createdAt})`);

    const downloadsTimeSeriesQuery = startDate
      ? db
          .select({
            date: sql<string>`date_trunc('hour', ${mods.createdAt})`.as("date"),
            downloads: sum(mods.downloadCount).as("downloads"),
          })
          .from(mods)
          .where(gte(mods.createdAt, startDate))
          .groupBy(sql`date_trunc('hour', ${mods.createdAt})`)
          .orderBy(sql`date_trunc('hour', ${mods.createdAt})`)
      : db
          .select({
            date: sql<string>`date_trunc('hour', ${mods.createdAt})`.as("date"),
            downloads: sum(mods.downloadCount).as("downloads"),
          })
          .from(mods)
          .groupBy(sql`date_trunc('hour', ${mods.createdAt})`)
          .orderBy(sql`date_trunc('hour', ${mods.createdAt})`);

    const usersTimeSeriesQuery = startDate
      ? db
          .select({
            date: sql<string>`date_trunc('hour', ${user.createdAt})`.as("date"),
            count: count(user.id).as("count"),
          })
          .from(user)
          .where(gte(user.createdAt, startDate))
          .groupBy(sql`date_trunc('hour', ${user.createdAt})`)
          .orderBy(sql`date_trunc('hour', ${user.createdAt})`)
      : db
          .select({
            date: sql<string>`date_trunc('hour', ${user.createdAt})`.as("date"),
            count: count(user.id).as("count"),
          })
          .from(user)
          .groupBy(sql`date_trunc('hour', ${user.createdAt})`)
          .orderBy(sql`date_trunc('hour', ${user.createdAt})`);

    const modFilesTimeSeriesQuery = startDate
      ? db
          .select({
            date: sql<string>`date_trunc('hour', ${schema.modDownloads.createdAt})`.as(
              "date",
            ),
            count: count(schema.modDownloads.id).as("count"),
          })
          .from(schema.modDownloads)
          .where(gte(schema.modDownloads.createdAt, startDate))
          .groupBy(sql`date_trunc('hour', ${schema.modDownloads.createdAt})`)
          .orderBy(sql`date_trunc('hour', ${schema.modDownloads.createdAt})`)
      : db
          .select({
            date: sql<string>`date_trunc('hour', ${schema.modDownloads.createdAt})`.as(
              "date",
            ),
            count: count(schema.modDownloads.id).as("count"),
          })
          .from(schema.modDownloads)
          .groupBy(sql`date_trunc('hour', ${schema.modDownloads.createdAt})`)
          .orderBy(sql`date_trunc('hour', ${schema.modDownloads.createdAt})`);

    const modsTotalsQuery = startDate
      ? db
          .select({
            totalMods: count(mods.id),
          })
          .from(mods)
          .where(gte(mods.createdAt, startDate))
      : db
          .select({
            totalMods: count(mods.id),
          })
          .from(mods);

    const downloadsTotalsQuery = startDate
      ? db
          .select({
            totalDownloads: sum(mods.downloadCount),
          })
          .from(mods)
          .where(gte(mods.createdAt, startDate))
      : db
          .select({
            totalDownloads: sum(mods.downloadCount),
          })
          .from(mods);

    const usersTotalsQuery = startDate
      ? db
          .select({
            totalUsers: count(user.id),
          })
          .from(user)
          .where(gte(user.createdAt, startDate))
      : db
          .select({
            totalUsers: count(user.id),
          })
          .from(user);

    const modFilesTotalsQuery = startDate
      ? db
          .select({
            totalModFiles: count(schema.modDownloads.id),
          })
          .from(schema.modDownloads)
          .where(gte(schema.modDownloads.createdAt, startDate))
      : db
          .select({
            totalModFiles: count(schema.modDownloads.id),
          })
          .from(schema.modDownloads);

    const [
      modsData,
      downloadsData,
      usersData,
      modFilesData,
      modsTotals,
      downloadsTotals,
      usersTotals,
      modFilesTotals,
    ] = await Promise.all([
      modsTimeSeriesQuery,
      downloadsTimeSeriesQuery,
      usersTimeSeriesQuery,
      modFilesTimeSeriesQuery,
      modsTotalsQuery,
      downloadsTotalsQuery,
      usersTotalsQuery,
      modFilesTotalsQuery,
    ]);

    const dateMap = new Map<
      string,
      { mods: number; downloads: number; users: number; modFiles: number }
    >();

    modsData.forEach((item) => {
      const date = item.date;
      const count = Number(item.count);
      if (!dateMap.has(date)) {
        dateMap.set(date, { mods: 0, downloads: 0, users: 0, modFiles: 0 });
      }
      dateMap.get(date)!.mods = count;
    });

    downloadsData.forEach((item) => {
      const date = item.date;
      const downloads = Number(item.downloads) || 0;
      if (!dateMap.has(date)) {
        dateMap.set(date, { mods: 0, downloads: 0, users: 0, modFiles: 0 });
      }
      dateMap.get(date)!.downloads = downloads;
    });

    usersData.forEach((item) => {
      const date = item.date;
      const count = Number(item.count);
      if (!dateMap.has(date)) {
        dateMap.set(date, { mods: 0, downloads: 0, users: 0, modFiles: 0 });
      }
      dateMap.get(date)!.users = count;
    });

    modFilesData.forEach((item) => {
      const date = item.date;
      const count = Number(item.count);
      if (!dateMap.has(date)) {
        dateMap.set(date, { mods: 0, downloads: 0, users: 0, modFiles: 0 });
      }
      dateMap.get(date)!.modFiles = count;
    });

    const result = Array.from(dateMap.entries())
      .map(([date, data]) => ({
        date,
        mods: data.mods,
        downloads: data.downloads,
        users: data.users,
        modFiles: data.modFiles,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      data: result,
      totals: {
        mods: Number(modsTotals[0]?.totalMods) || 0,
        downloads: Number(downloadsTotals[0]?.totalDownloads) || 0,
        users: Number(usersTotals[0]?.totalUsers) || 0,
        modFiles: Number(modFilesTotals[0]?.totalModFiles) || 0,
      },
    };
  }
}
