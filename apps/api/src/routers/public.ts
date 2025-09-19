import { z } from "zod";
import { env } from "@/lib/env";
import { publicProcedure } from "../lib/orpc";
import { GitHubReleasesService } from "../lib/services/github-releases";
import { HealthService } from "../lib/services/health";
import type { ReleasesResponse } from "../types/github-releases";
import type { HealthResponse } from "../types/health";
import { version } from "../version";

const HealthResponseSchema = z.object({
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
});

const VersionResponseSchema = z.object({
  version: z.string(),
});

const StatusResponseSchema = z.object({
  status: z.enum(["operational", "downtime", "degraded"]),
});

const PlatformDownloadSchema = z.object({
  platform: z.enum(["windows", "macos", "linux"]),
  architecture: z.enum(["x64", "arm64", "universal"]),
  url: z.string(),
  filename: z.string(),
  size: z.number(),
  downloadCount: z.number(),
});

const ReleasesResponseSchema = z.object({
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

export const publicRouter = {
  healthCheck: publicProcedure
    .route({ method: "GET", path: "/health" })
    .output(HealthResponseSchema)
    .handler(async (): Promise<HealthResponse> => {
      const service = HealthService.getInstance();
      return await service.check();
    }),

  getVersion: publicProcedure
    .route({ method: "GET", path: "/version" })
    .output(VersionResponseSchema)
    .handler(async () => {
      try {
        const response = await fetch(
          "https://github.com/Stormix/deadlock-modmanager/releases/latest/download/latest.json",
          {
            headers: { Accept: "application/json" },
          },
        );

        if (!response.ok) {
          return { version: "unknown" };
        }

        const data = (await response.json()) as { version: string };
        return { version: data.version };
      } catch {
        // Fallback to hardcoded version if GitHub fetch fails
        return { version };
      }
    }),

  getStatus: publicProcedure
    .route({ method: "GET", path: "/status" })
    .output(StatusResponseSchema)
    .handler(async () => {
      try {
        const response = await fetch(
          "https://betteruptime.com/api/v2/status-pages/184676",
          {
            headers: {
              Authorization: `Bearer ${env.BETTERSTACK_API_KEY}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = (await response.json()) as {
          data: { attributes: { aggregate_state: string } };
        };
        const betterStackStatus = data.data.attributes.aggregate_state;

        // Map betterstack status to our status format
        let status: "operational" | "downtime" | "degraded";
        switch (betterStackStatus.toLowerCase()) {
          case "operational":
            status = "operational";
            break;
          case "degraded":
            status = "degraded";
            break;
          default:
            status = "downtime";
        }

        return { status };
      } catch (_error) {
        return { status: "downtime" as const };
      }
    }),

  getReleases: publicProcedure
    .route({ method: "GET", path: "/releases" })
    .output(ReleasesResponseSchema)
    .handler(async (): Promise<ReleasesResponse> => {
      try {
        const service = GitHubReleasesService.getInstance();
        return await service.fetchReleases();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        throw new Error(`Failed to fetch releases: ${errorMessage}`);
      }
    }),
};
