import {
  db,
  ModDownloadRepository,
  ModRepository,
} from "@deadlock-mods/database";
import {
  CheckUpdatesInputSchema,
  CheckUpdatesResponseSchema,
  ModDownloadsResponseSchema,
  ModDownloadsV2ResponseSchema,
  ModIdParamSchema,
  ModSchema,
  ModsListResponseSchema,
  toModDownloadDto,
  toModDto,
} from "@deadlock-mods/shared";
import { ORPCError } from "@orpc/server";
import { env } from "@/lib/env";
import { featureFlagsService } from "@/services/feature-flags";
import { publicProcedure } from "../../lib/orpc";
import { ModSyncService } from "../../services/mod-sync";
import { ForceSyncOutputSchema } from "../../validation/mods";

const modRepository = new ModRepository(db);
const modDownloadRepository = new ModDownloadRepository(db);

export const modsRouter = {
  listModsV2: publicProcedure
    .route({ method: "GET", path: "/v2/mods" })
    .output(ModsListResponseSchema)
    .handler(async () => {
      const allMods = await modRepository.findAll();
      return allMods.map(toModDto);
    }),

  getModV2: publicProcedure
    .route({ method: "GET", path: "/v2/mods/{id}" })
    .input(ModIdParamSchema)
    .output(ModSchema)
    .handler(async ({ input }) => {
      const mod = await modRepository.findByRemoteId(input.id);
      if (!mod) {
        throw new ORPCError("NOT_FOUND");
      }
      return toModDto(mod);
    }),

  getModDownloadsV2: publicProcedure
    .route({ method: "GET", path: "/v2/mods/{id}/downloads" })
    .input(ModIdParamSchema)
    .output(ModDownloadsV2ResponseSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session?.user?.id;
      const isModDownloadMirroringEnabled =
        await featureFlagsService.isFeatureEnabled(
          "mod-download-mirroring",
          userId,
        );

      const mod = await modRepository.findByRemoteId(input.id);
      if (!mod) {
        throw new ORPCError("NOT_FOUND");
      }

      const downloads = await modDownloadRepository.findByModId(mod.id);
      if (downloads.length === 0) {
        throw new ORPCError("NOT_FOUND");
      }

      const sortedDownloads = downloads
        .sort((a, b) => b.size - a.size)
        .map((download) => ({
          ...download,
          url: isModDownloadMirroringEnabled.unwrapOr(false)
            ? `${env.MIRROR_SERVICE_URL}/download/${mod.id}/${download.id}`
            : download.url,
        }));

      return {
        downloads: toModDownloadDto(sortedDownloads),
        count: sortedDownloads.length,
      };
    }),

  getModDownloadV2: publicProcedure
    .route({ method: "GET", path: "/v2/mods/{id}/download" })
    .input(ModIdParamSchema)
    .output(ModDownloadsResponseSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session?.user?.id;
      const isModDownloadMirroringEnabled =
        await featureFlagsService.isFeatureEnabled(
          "mod-download-mirroring",
          userId,
        );

      const mod = await modRepository.findByRemoteId(input.id);
      if (!mod) {
        throw new ORPCError("NOT_FOUND");
      }

      const downloads = await modDownloadRepository.findByModId(mod.id);
      if (downloads.length === 0) {
        throw new ORPCError("NOT_FOUND");
      }

      // V2: Return all downloads even on the old endpoint
      const sortedDownloads = downloads
        .sort((a, b) => b.size - a.size)
        .map((download) => ({
          ...download,
          url: isModDownloadMirroringEnabled.unwrapOr(false)
            ? `${env.MIRROR_SERVICE_URL}/download/${mod.id}/${download.id}`
            : download.url,
        }));

      return toModDownloadDto(sortedDownloads);
    }),

  checkModUpdates: publicProcedure
    .route({ method: "POST", path: "/v2/mods/check-updates" })
    .input(CheckUpdatesInputSchema)
    .output(CheckUpdatesResponseSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session?.user?.id;
      const isModDownloadMirroringEnabled =
        await featureFlagsService.isFeatureEnabled(
          "mod-download-mirroring",
          userId,
        );

      const remoteIds = input.mods.map((m) => m.remoteId);
      const installedModsMap = new Map(
        input.mods.map((m) => [m.remoteId, m.installedAt]),
      );

      const mods = await modRepository.findByRemoteIds(remoteIds);

      const updates = [];

      for (const mod of mods) {
        const installedAt = installedModsMap.get(mod.remoteId);
        if (!installedAt || !mod.filesUpdatedAt) {
          continue;
        }

        if (mod.filesUpdatedAt.getTime() > installedAt.getTime()) {
          const downloads = await modDownloadRepository.findByModId(mod.id);

          const sortedDownloads = downloads
            .sort((a, b) => b.size - a.size)
            .map((download) => ({
              ...download,
              url: isModDownloadMirroringEnabled.unwrapOr(false)
                ? `${env.MIRROR_SERVICE_URL}/download/${mod.id}/${download.id}`
                : download.url,
            }));

          updates.push({
            mod: toModDto(mod),
            downloads: toModDownloadDto(sortedDownloads),
          });
        }
      }

      return { updates };
    }),

  forceSyncV2: publicProcedure
    .route({ method: "POST", path: "/v2/sync" })
    .output(ForceSyncOutputSchema)
    .handler(async () => {
      try {
        const syncService = ModSyncService.getInstance();
        const result = await syncService.synchronizeMods();

        if (!result.success) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: result.message,
          });
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: `Failed to trigger sync: ${errorMessage}`,
        });
      }
    }),
};
