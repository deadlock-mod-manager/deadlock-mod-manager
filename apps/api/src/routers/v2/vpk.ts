import { z } from 'zod';
import { ModAnalyser } from '@/lib/services/mod-analyser';
import { publicProcedure } from '../../lib/orpc';

export const vpkRouter = {
  analyseVPK: publicProcedure
    .route({ method: 'POST', path: '/v2/vpk-analyse' })
    .input(
      z.object({
        vpk: z.file(),
      })
    )
    .handler(async ({ input }) => {
      const buffer = Buffer.from(await input.vpk.arrayBuffer());
      const result = await ModAnalyser.instance.analyseVPK(buffer);

      return result;
      // try {
      //   const syncService = ModSyncService.getInstance();
      //   const result = await syncService.synchronizeMods();
      //   if (!result.success) {
      //     throw new ORPCError('INTERNAL_SERVER_ERROR', {
      //       message: result.message,
      //     });
      //   }
      //   return result;
      // } catch (error) {
      //   const errorMessage =
      //     error instanceof Error ? error.message : 'Unknown error occurred';
      //   throw new ORPCError('INTERNAL_SERVER_ERROR', {
      //     message: `Failed to trigger sync: ${errorMessage}`,
      //   });
      // }
    }),
};
