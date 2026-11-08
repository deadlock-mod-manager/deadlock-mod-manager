import { z } from "zod";
import { hostedSourceDefinitions } from "@/hosted-sources/definitions";
import {
  buildHostedSourceCatalog,
  buildHostedSourceDescriptor,
  HOSTED_SOURCE_ID,
  HOSTED_SOURCE_NAME,
  hostedSourceCatalogSchema,
  hostedSourceDescriptorSchema,
} from "@/hosted-sources/documents";
import { env } from "@/lib/env";
import { publicProcedure } from "@/lib/orpc";
import { HostedSourcesService } from "@/services/hosted-sources";

// Short enough that a flag flip reaches clients on their next refresh.
const HEADERS = { "Cache-Control": "public, max-age=300" };
const apiOrigin = new URL(env.API_PUBLIC_URL).origin;
const headersSchema = z.record(z.string(), z.string());

export const hostedSourcesRouter = {
  listHostedSources: publicProcedure
    .route({
      method: "GET",
      path: "/v2/hosted-sources",
      summary: "Hosted mod sources",
      description:
        "The mod source DMM publishes for projects that only offer an archive link. The desktop app enrolls it once, even while it has no packs.",
    })
    .output(
      z.object({
        sources: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            descriptorUrl: z.string(),
          }),
        ),
      }),
    )
    .handler(() => ({
      sources: [
        {
          id: HOSTED_SOURCE_ID,
          name: HOSTED_SOURCE_NAME,
          descriptorUrl: `${apiOrigin}/api/v2/hosted-sources/dmm-source.json`,
        },
      ],
    })),

  getHostedSourceDescriptor: publicProcedure
    .route({
      method: "GET",
      path: "/v2/hosted-sources/dmm-source.json",
      summary: "Hosted mod source descriptor",
      outputStructure: "detailed",
    })
    .output(
      z.object({ headers: headersSchema, body: hostedSourceDescriptorSchema }),
    )
    .handler(() => ({
      headers: HEADERS,
      body: buildHostedSourceDescriptor(hostedSourceDefinitions, apiOrigin),
    })),

  getHostedSourceCatalog: publicProcedure
    .route({
      method: "GET",
      path: "/v2/hosted-sources/catalog.json",
      summary: "Hosted mod source catalog",
      outputStructure: "detailed",
    })
    .output(
      z.object({ headers: headersSchema, body: hostedSourceCatalogSchema }),
    )
    .handler(async () => ({
      headers: HEADERS,
      body: buildHostedSourceCatalog(
        await HostedSourcesService.getInstance().listingStates(),
      ),
    })),
};
