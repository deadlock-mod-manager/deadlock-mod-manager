import { env } from "@/lib/env";
import { publicProcedure } from "../../lib/orpc";
import { GitHubReleasesService } from "../../services/github-releases";
import { HealthService } from "../../services/health";
import { StatsService } from "../../services/stats";
import type { ReleasesResponse } from "../../types/github-releases";
import type { HealthResponse } from "../../types/health";
import type {
  StatsResponse,
  TransparencyStatsResponse,
} from "../../types/stats";
import {
  HealthResponseSchema,
  ReleasesResponseSchema,
  StatsResponseSchema,
  StatusResponseSchema,
  TransparencyStatsResponseSchema,
  VersionResponseSchema,
} from "../../validation/www";
import { version } from "../../version";

export const publicRouter = {
  healthCheck: publicProcedure
    .route({ method: "GET", path: "/health" })
    .output(HealthResponseSchema)
    .handler(async (): Promise<HealthResponse> => {
      const service = HealthService.getInstance();
      return service.check();
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
        throw new Error(`Failed to fetch releases: ${errorMessage}`, {
          cause: error,
        });
      }
    }),

  getStats: publicProcedure
    .route({ method: "GET", path: "/stats" })
    .output(StatsResponseSchema)
    .handler(async (): Promise<StatsResponse> => {
      const service = StatsService.getInstance();
      return await service.getStats();
    }),

  getTransparencyStats: publicProcedure
    .route({ method: "GET", path: "/transparency-stats" })
    .output(TransparencyStatsResponseSchema)
    .handler(async (): Promise<TransparencyStatsResponse> => {
      const service = StatsService.getInstance();
      return await service.getTransparencyStats();
    }),
};
