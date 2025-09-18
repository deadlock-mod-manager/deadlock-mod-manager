import { modDownloadRepository, modRepository } from '@deadlock-mods/database';
import {
  ModDownloadsResponseSchema,
  ModDownloadsV2ResponseSchema,
  ModIdParamSchema,
  ModSchema,
  ModsListResponseSchema,
  toModDownloadDto,
  toModDto,
} from '@deadlock-mods/utils';
import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { publicProcedure } from '../../lib/orpc';
import { ModSyncService } from '../../lib/services/mod-sync';

export const modsRouter = {
  listModsV2: publicProcedure
    .route({ method: 'GET', path: '/v2/mods' })
    .output(ModsListResponseSchema)
    .handler(async () => {
      const allMods = await modRepository.findAll();
      return allMods.map(toModDto);
    }),

  getModV2: publicProcedure
    .route({ method: 'GET', path: '/v2/mods/{id}' })
    .input(ModIdParamSchema)
    .output(ModSchema)
    .handler(async ({ input }) => {
      const mod = await modRepository.findByRemoteId(input.id);
      if (!mod) {
        throw new ORPCError('NOT_FOUND');
      }
      return toModDto(mod);
    }),

  getModDownloadsV2: publicProcedure
    .route({ method: 'GET', path: '/v2/mods/{id}/downloads' })
    .input(ModIdParamSchema)
    .output(ModDownloadsV2ResponseSchema)
    .handler(async ({ input }) => {
      const mod = await modRepository.findByRemoteId(input.id);
      if (!mod) {
        throw new ORPCError('NOT_FOUND');
      }

      const downloads = await modDownloadRepository.findByModId(mod.id);
      if (downloads.length === 0) {
        throw new ORPCError('NOT_FOUND');
      }

      // V2: Return all downloads sorted by size (largest first)
      const sortedDownloads = downloads.sort((a, b) => b.size - a.size);
      return {
        downloads: toModDownloadDto(sortedDownloads),
        count: sortedDownloads.length,
      };
    }),

  getModDownloadV2: publicProcedure
    .route({ method: 'GET', path: '/v2/mods/{id}/download' })
    .input(ModIdParamSchema)
    .output(ModDownloadsResponseSchema)
    .handler(async ({ input }) => {
      const mod = await modRepository.findByRemoteId(input.id);
      if (!mod) {
        throw new ORPCError('NOT_FOUND');
      }

      const downloads = await modDownloadRepository.findByModId(mod.id);
      if (downloads.length === 0) {
        throw new ORPCError('NOT_FOUND');
      }

      // V2: Return all downloads even on the old endpoint
      const sortedDownloads = downloads.sort((a, b) => b.size - a.size);
      return toModDownloadDto(sortedDownloads);
    }),

  forceSyncV2: publicProcedure
    .route({ method: 'POST', path: '/v2/sync' })
    .output(
      z.object({
        success: z.boolean(),
        message: z.string(),
      })
    )
    .handler(async () => {
      try {
        const syncService = ModSyncService.getInstance();
        const result = await syncService.synchronizeMods();

        if (!result.success) {
          throw new ORPCError('INTERNAL_SERVER_ERROR', {
            message: result.message,
          });
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: `Failed to trigger sync: ${errorMessage}`,
        });
      }
    }),
};
