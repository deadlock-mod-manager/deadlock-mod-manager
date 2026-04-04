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
  toModDto,
} from "@deadlock-mods/shared";
import { ORPCError } from "@orpc/server";
import { featureFlagsService } from "@/services/feature-flags";
import { formatModDownloads } from "@/lib/utils";
import { createRateLimitMiddleware, publicProcedure } from "../../lib/orpc";
import { ModSyncService } from "../../services/mod-sync";
import { ForceSyncOutputSchema } from "../../validation/mods";

const syncRateLimit = createRateLimitMiddleware({
  maxRequests: 3,
  windowSeconds: 60,
});

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

      return {
        downloads: formatModDownloads(
          downloads,
          mod.id,
          isModDownloadMirroringEnabled.unwrapOr(false),
        ),
        count: downloads.length,
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

      return formatModDownloads(
        downloads,
        mod.id,
        isModDownloadMirroringEnabled.unwrapOr(false),
      );
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

      const modsNeedingUpdate = mods.filter((mod) => {
        const installedAt = installedModsMap.get(mod.remoteId);
        return (
          installedAt &&
          mod.filesUpdatedAt &&
          mod.filesUpdatedAt.getTime() > installedAt.getTime()
        );
      });

      const allDownloads = await modDownloadRepository.findByModIds(
        modsNeedingUpdate.map((mod) => mod.id),
      );

      const downloadsByModId = Map.groupBy(allDownloads, (d) => d.modId);

      const updates = modsNeedingUpdate.map((mod) => ({
        mod: toModDto(mod),
        downloads: formatModDownloads(
          downloadsByModId.get(mod.id) ?? [],
          mod.id,
          isModDownloadMirroringEnabled.unwrapOr(false),
        ),
      }));

      return { updates };
    }),

  forceSyncV2: publicProcedure
    .use(syncRateLimit)
    .route({ method: "POST", path: "/v2/sync" })
    .output(ForceSyncOutputSchema)
    .handler(async () => {
      const syncService = ModSyncService.getInstance();
      const result = await syncService.synchronizeMods();

      if (!result.success) {
        throw new ORPCError(
          result.locked ? "CONFLICT" : "INTERNAL_SERVER_ERROR",
          {
            message: result.message,
          },
        );
      }

      return result;
    }),

  forceSyncModV2: publicProcedure
    .use(syncRateLimit)
    .route({ method: "POST", path: "/v2/sync/{id}" })
    .input(ModIdParamSchema)
    .output(ForceSyncOutputSchema)
    .handler(async ({ input }) => {
      const syncService = ModSyncService.getInstance();
      const result = await syncService.synchronizeMod(input.id);

      if (!result.success) {
        throw new ORPCError(
          result.locked ? "CONFLICT" : "INTERNAL_SERVER_ERROR",
          {
            message: result.message,
          },
        );
      }

      return result;
    }),
};
