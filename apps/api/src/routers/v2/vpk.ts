import { ORPCError } from "@orpc/server";
import { VPK_CONSTANTS } from "@/lib/constants";
import { wideEventContext } from "@/lib/logger";
import { ModAnalyser } from "@/services/mod-analyser";
import { publicProcedure } from "../../lib/orpc";
import {
  AnalyseHashesInputSchema,
  AnalyseVPKInputSchema,
} from "../../validation/vpk";

export const vpkRouter = {
  analyseHashes: publicProcedure
    .route({ method: "POST", path: "/v2/vpk-analyse-hashes" })
    .input(AnalyseHashesInputSchema)
    .handler(async ({ input }) => {
      const hashes = {
        sha256: input.sha256,
        contentSignature: input.contentSignature,
        fastHash: input.fastHash,
        fileSize: input.fileSize,
        merkleRoot: input.merkleRoot,
      };
      const results = await ModAnalyser.instance.analyseHashes(hashes);
      return results;
    }),
  analyseVPK: publicProcedure
    .route({ method: "POST", path: "/v2/vpk-analyse" })
    .input(AnalyseVPKInputSchema)
    .handler(async ({ input }) => {
      const fileSizeBytes = input.vpk.size;
      const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(1);

      const wide = wideEventContext.get();
      wide?.merge({
        router: "vpk",
        fileName: input.vpk.name,
        fileSizeBytes,
        fileSizeMB: `${fileSizeMB}MB`,
      });

      if (fileSizeBytes > VPK_CONSTANTS.MAX_FILE_SIZE_BYTES) {
        wide?.set("outcomeReason", "file_too_large");
        throw new ORPCError("BAD_REQUEST", {
          message: `File size ${fileSizeMB}MB exceeds maximum limit of ${VPK_CONSTANTS.MAX_FILE_SIZE_MB}MB`,
        });
      }

      try {
        const buffer = Buffer.from(await input.vpk.arrayBuffer());
        const result = await ModAnalyser.instance.analyseVPK(buffer);

        wide?.merge({
          hasMatch: !!result.matchedVpk,
          modName: result.matchedVpk?.mod?.name,
        });

        return result;
      } catch (error) {
        wide?.set("outcomeReason", "analysis_failed");
        throw error;
      }
    }),
};
