import { db, mods } from "@deadlock-mods/database";
import { count, sum } from "drizzle-orm";
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
}
