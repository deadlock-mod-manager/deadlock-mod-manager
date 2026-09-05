import { count, db, gte, sql, user } from "@deadlock-mods/database";
import { CACHE_TTL } from "@/lib/constants";
import { cache } from "@/lib/redis";
import type { StatsResponse, TransparencyStatsResponse } from "../types/stats";
import { GitHubReleasesService } from "./github-releases";
import { countAppDownloads } from "./stats-counts";

export class StatsService {
  private static instance: StatsService;

  private constructor() {}

  static getInstance(): StatsService {
    if (!StatsService.instance) StatsService.instance = new StatsService();
    return StatsService.instance;
  }

  async getStats(): Promise<StatsResponse> {
    return cache.wrap(
      "stats:platform-v2",
      async () => {
        const [releases, userCount] = await Promise.all([
          GitHubReleasesService.getInstance().fetchReleases(),
          db.select({ count: count(user.id) }).from(user),
        ]);
        return {
          appDownloads: countAppDownloads(releases.allVersions),
          totalUsers: userCount[0]?.count ?? 0,
        };
      },
      CACHE_TTL.STATS,
    );
  }

  async getTransparencyStats(): Promise<TransparencyStatsResponse> {
    return await this.getStats();
  }

  async getAnalytics(hours: number | null = 2160) {
    const startDate =
      hours === null ? null : new Date(Date.now() - hours * 60 * 60 * 1_000);
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
    const usersTotalsQuery = startDate
      ? db
          .select({ totalUsers: count(user.id) })
          .from(user)
          .where(gte(user.createdAt, startDate))
      : db.select({ totalUsers: count(user.id) }).from(user);
    const [usersData, usersTotals, releases] = await Promise.all([
      usersTimeSeriesQuery,
      usersTotalsQuery,
      GitHubReleasesService.getInstance().fetchReleases(),
    ]);
    return {
      data: usersData.map((item) => ({
        date: item.date,
        users: Number(item.count),
      })),
      totals: {
        users: Number(usersTotals[0]?.totalUsers) || 0,
        appDownloads: countAppDownloads(releases.allVersions),
      },
    };
  }
}
