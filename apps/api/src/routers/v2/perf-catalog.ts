import { z } from "zod";
import { publicProcedure } from "@/lib/orpc";
import { perfCatalogResponse } from "@/services/perf-catalog";

export const perfCatalogRouter = {
  getPerfCatalog: publicProcedure
    .route({
      method: "GET",
      path: "/v2/perf-catalog",
      summary: "Performance config catalog",
      description:
        "Curated performance presets, convar metadata and stock gameinfo.gi history for the desktop app. Honors If-None-Match with the catalog version.",
      inputStructure: "detailed",
      outputStructure: "detailed",
    })
    .input(
      z.object({
        headers: z.object({ "if-none-match": z.string().optional() }),
      }),
    )
    .handler(({ input }) =>
      perfCatalogResponse(input.headers["if-none-match"]),
    ),
};
