import { z } from "zod";
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
      const buffer = Buffer.from(await input.vpk.arrayBuffer());
      return ModAnalyser.instance.analyseVPK(buffer);
    }),
};
