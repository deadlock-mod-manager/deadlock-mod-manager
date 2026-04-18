import {
  RelaysHealthResponseSchema,
  ResolveModsResponseSchema,
  ServerBrowserEntrySchema,
  ServerBrowserFacetsResponseSchema,
  ServerBrowserIdParamSchema,
  ServerBrowserListInputSchema,
  ServerBrowserListResponseSchema,
} from "@deadlock-mods/shared";
import { ORPCError } from "@orpc/server";
import { createRateLimitMiddleware, publicProcedure } from "../../lib/orpc";
import { RelayDiscoveryService } from "../../services/relay-discovery";
import { ServerBrowserService } from "../../services/server-browser";
import { ServerModsResolver } from "../../services/server-mods-resolver";

const browseRateLimit = createRateLimitMiddleware({
  maxRequests: 60,
  windowSeconds: 60,
});

export const serversRouter = {
  listServersV2: publicProcedure
    .use(browseRateLimit)
    .route({ method: "GET", path: "/v2/servers" })
    .input(ServerBrowserListInputSchema.optional())
    .output(ServerBrowserListResponseSchema)
    .handler(async ({ input }) => {
      const service = ServerBrowserService.getInstance();
      return service.listServers(input ?? {});
    }),

  listServerFacetsV2: publicProcedure
    .use(browseRateLimit)
    .route({ method: "GET", path: "/v2/servers/facets" })
    .output(ServerBrowserFacetsResponseSchema)
    .handler(async () => {
      const service = ServerBrowserService.getInstance();
      return service.listFacets();
    }),

  getServerV2: publicProcedure
    .use(browseRateLimit)
    .route({ method: "GET", path: "/v2/servers/{id}" })
    .input(ServerBrowserIdParamSchema)
    .output(ServerBrowserEntrySchema)
    .handler(async ({ input }) => {
      const service = ServerBrowserService.getInstance();
      const server = await service.getServer(input.id);
      if (!server) {
        throw new ORPCError("NOT_FOUND");
      }
      return server;
    }),

  listRelaysHealthV2: publicProcedure
    .use(browseRateLimit)
    .route({ method: "GET", path: "/v2/relays/health" })
    .output(RelaysHealthResponseSchema)
    .handler(async () => {
      const discovery = RelayDiscoveryService.getInstance();
      const relays = await discovery.getHealthSnapshot();
      return { relays };
    }),

  resolveServerModsV2: publicProcedure
    .use(browseRateLimit)
    .route({ method: "POST", path: "/v2/servers/{id}/resolve-mods" })
    .input(ServerBrowserIdParamSchema)
    .output(ResolveModsResponseSchema)
    .handler(async ({ input }) => {
      const browser = ServerBrowserService.getInstance();
      const server = await browser.getServer(input.id);
      if (!server) {
        throw new ORPCError("NOT_FOUND");
      }
      const resolver = ServerModsResolver.getInstance();
      const { resolved, missing } = await resolver.resolve(
        server.required_mods,
      );
      return { resolved, missing };
    }),
};
