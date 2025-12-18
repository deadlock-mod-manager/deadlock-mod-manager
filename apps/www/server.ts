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

interface NodeResponseLike {
  status: number;
  statusText?: string;
  headers: Headers;
  body: ReadableStream | null;
  _response?: Response;
  nodeResponse?: () => Response;
}

async function toWebResponse(
  response: Response | NodeResponseLike,
): Promise<Response> {
  // Check if it's a native Response (not a wrapper)
  const isNativeResponse =
    response instanceof Response && response.constructor.name === "Response";

  if (isNativeResponse) {
    return response as Response;
  }

  // It's a NodeResponse wrapper - we need to convert it to a native Response
  // Clone the body to avoid "body already used" errors
  const res = response as NodeResponseLike;
  const body = res.body;
  const headers = new Headers();

  // Copy headers
  if (res.headers) {
    res.headers.forEach((value: string, key: string) => {
      headers.set(key, value);
    });
  }

  return new Response(body, {
    status: res.status,
    statusText: res.statusText || "",
    headers,
  });
}

async function initializeServer() {
  logger.info("Starting Production Server");

  const serverModule = (await import(SERVER_ENTRY_POINT)) as {
    default: {
      fetch: (
        request: Request,
      ) => Response | NodeResponseLike | Promise<Response | NodeResponseLike>;
    };
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
      "/*": async (req: Request) => {
        try {
          const response = await handler.fetch(req);
          return await toWebResponse(response);
        } catch (error) {
          // Handle TanStack Router redirect throws
          if (
            error &&
            typeof error === "object" &&
            "status" in error &&
            "headers" in error
          ) {
            return await toWebResponse(error as NodeResponseLike);
          }
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
