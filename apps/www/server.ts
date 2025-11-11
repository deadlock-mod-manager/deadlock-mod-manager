import { env } from "./env";
import { logger } from "./logger";
import { convertGlobToRegExp, initializeStaticRoutes } from "./server-utils";

const CLIENT_DIRECTORY = "./dist/client";
const SERVER_ENTRY_POINT = "./dist/server/server.js";

const INCLUDE_PATTERNS = env.ASSET_PRELOAD_INCLUDE_PATTERNS.map((pattern) =>
  convertGlobToRegExp(pattern),
);
const EXCLUDE_PATTERNS = env.ASSET_PRELOAD_EXCLUDE_PATTERNS.map((pattern) =>
  convertGlobToRegExp(pattern),
);

let isReady = false;

async function initializeServer() {
  logger.info("Starting Production Server");

  const serverModule = (await import(SERVER_ENTRY_POINT)) as {
    default: { fetch: (request: Request) => Response | Promise<Response> };
  };
  const handler = serverModule.default;
  logger.info("TanStack Start application handler initialized");

  const { routes } = await initializeStaticRoutes(
    CLIENT_DIRECTORY,
    INCLUDE_PATTERNS,
    EXCLUDE_PATTERNS,
  );

  const server = Bun.serve({
    port: env.PORT,
    routes: {
      "/health": () => new Response("OK", { status: 200 }),
      "/ready": () =>
        isReady
          ? new Response("OK", { status: 200 })
          : new Response("Not Ready", { status: 503 }),
      ...routes,
      "/*": (req: Request) => {
        try {
          return handler.fetch(req);
        } catch (error) {
          logger.withError(error as Error).error("Server handler error");
          return new Response("Internal Server Error", { status: 500 });
        }
      },
    },
    error(error) {
      logger
        .withError(error instanceof Error ? error : new Error(String(error)))
        .error("Uncaught server error");
      return new Response("Internal Server Error", { status: 500 });
    },
  });

  logger.info(`Server listening on http://localhost:${String(server.port)}`);
  isReady = true;
}

initializeServer().catch((error: unknown) => {
  logger.withError(error as Error).error("Failed to start server");
  process.exit(1);
});
