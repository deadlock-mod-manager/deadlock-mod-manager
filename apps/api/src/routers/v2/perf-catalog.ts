import { catalogSchema } from "@deadlock-mods/perf-catalog";
import { JSON_SCHEMA_REGISTRY } from "@orpc/zod/zod4";
import { z } from "zod";
import { publicProcedure } from "@/lib/orpc";
import { perfCatalogResponse } from "@/services/perf-catalog";

// The catalog is validated once at load; skip re-parsing ~2.5 MB per response
// but still document its shape in the OpenAPI spec.
const catalogBody = z.unknown().nonoptional();
JSON_SCHEMA_REGISTRY.add(
  catalogBody,
  z.toJSONSchema(catalogSchema) as Parameters<
    typeof JSON_SCHEMA_REGISTRY.add<typeof catalogBody>
  >[1],
);

const headersSchema = z.record(z.string(), z.string());

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
    .output(
      z.union([
        z.object({ status: z.literal(304), headers: headersSchema }),
        z.object({
          status: z.literal(200),
          headers: headersSchema,
          body: catalogBody,
        }),
      ]),
    )
    .handler(({ input }) =>
      perfCatalogResponse(input.headers["if-none-match"]),
    ),
};
