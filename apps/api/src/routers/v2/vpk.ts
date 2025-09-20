import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { VPK_CONSTANTS } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { ModAnalyser } from "@/lib/services/mod-analyser";
import { publicProcedure } from "../../lib/orpc";

export const vpkRouter = {
  analyseVPK: publicProcedure
    .route({ method: "POST", path: "/v2/vpk-analyse" })
    .input(
      z.object({
        vpk: z.file(),
      }),
    )
    .handler(async ({ input }) => {
      const fileSizeBytes = input.vpk.size;
      const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(1);

      // Validate file size
      if (fileSizeBytes > VPK_CONSTANTS.MAX_FILE_SIZE_BYTES) {
        const maxSizeMB = VPK_CONSTANTS.MAX_FILE_SIZE_MB;
        logger
          .withMetadata({
            fileName: input.vpk.name,
            fileSizeBytes,
            fileSizeMB: `${fileSizeMB}MB`,
            maxSizeMB: `${maxSizeMB}MB`,
          })
          .warn("VPK file exceeds maximum size limit");

        throw new ORPCError("BAD_REQUEST", {
          message: `File size ${fileSizeMB}MB exceeds maximum limit of ${maxSizeMB}MB`,
        });
      }

      logger
        .withMetadata({
          fileName: input.vpk.name,
          fileSizeBytes,
          fileSizeMB: `${fileSizeMB}MB`,
        })
        .info("Starting VPK analysis");

      try {
        const buffer = Buffer.from(await input.vpk.arrayBuffer());

        logger
          .withMetadata({
            fileName: input.vpk.name,
            bufferSizeBytes: buffer.length,
          })
          .debug("VPK file loaded into buffer");

        const result = await ModAnalyser.instance.analyseVPK(buffer);

        logger
          .withMetadata({
            fileName: input.vpk.name,
            hasMatch: !!result.matchedVpk,
            modName: result.matchedVpk?.mod?.name,
          })
          .info("VPK analysis completed successfully");

        return result;
      } catch (error) {
        logger
          .withMetadata({
            fileName: input.vpk.name,
            fileSizeBytes,
            fileSizeMB: `${fileSizeMB}MB`,
          })
          .withError(error)
          .error("VPK analysis failed");

        throw error;
      }
    }),
};
