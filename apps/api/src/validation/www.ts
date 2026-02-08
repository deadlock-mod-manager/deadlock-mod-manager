import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  db: z.object({
    alive: z.boolean(),
    error: z.string().optional(),
  }),
  redis: z.object({
    alive: z.boolean(),
    error: z.string().optional(),
    configured: z.boolean(),
  }),
  version: z.string(),
  spec: z.string(),
});

export const VersionResponseSchema = z.object({
  version: z.string(),
});

export const StatusResponseSchema = z.object({
  status: z.enum(["operational", "downtime", "degraded"]),
});

export const PlatformDownloadSchema = z.object({
  platform: z.enum(["windows", "macos", "linux"]),
  architecture: z.enum(["x64", "arm64", "universal"]),
  installerType: z.enum(["exe", "msi", "dmg", "deb", "rpm", "appimage", "sig"]),
  url: z.string(),
  filename: z.string(),
  size: z.number(),
  downloadCount: z.number(),
});

export const ReleasesResponseSchema = z.object({
  latest: z.object({
    version: z.string(),
    name: z.string(),
    releaseNotes: z.string(),
    publishedAt: z.string(),
    downloads: z.array(PlatformDownloadSchema),
  }),
  allVersions: z.array(
    z.object({
      version: z.string(),
      name: z.string(),
      publishedAt: z.string(),
      prerelease: z.boolean(),
      downloads: z.array(PlatformDownloadSchema),
    }),
  ),
});

export const StatsResponseSchema = z.object({
  totalMods: z.number(),
  modDownloads: z.number(),
  appDownloads: z.number(),
});

export const TransparencyStatsResponseSchema = z.object({
  totalMods: z.number(),
  modDownloads: z.number(),
  appDownloads: z.number(),
  totalUsers: z.number(),
  totalModFiles: z.number(),
});

export const AnalyticsDataPointSchema = z.object({
  date: z.string(),
  mods: z.number(),
  downloads: z.number(),
  users: z.number(),
  modFiles: z.number(),
});

export const AnalyticsResponseSchema = z.array(AnalyticsDataPointSchema);

export const AnalyticsWithTotalsSchema = z.object({
  data: z.array(AnalyticsDataPointSchema),
  totals: z.object({
    mods: z.number(),
    downloads: z.number(),
    users: z.number(),
    modFiles: z.number(),
  }),
});
