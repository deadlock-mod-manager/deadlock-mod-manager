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

// Links pasted into prose ("see https://deadlockmods.app/download).") get
// crawled with the trailing punctuation and indexed as separate URLs.
const TRAILING_PUNCTUATION = /[).,\]]+$/;

// /login redirects to the auth provider before the page's noindex meta can
// render, so crawlers only ever see the redirect. Send the header instead.
const NOINDEX_PATHS = new Set(["/login"]);

// Agent discovery: the homepage advertises the public API through Link
// headers (RFC 8288) and /.well-known/api-catalog describes it (RFC 9727).
const API_URL = "https://api.deadlockmods.app/api";
const API_CATALOG_PATH = "/.well-known/api-catalog";
const HOMEPAGE_LINK_HEADER = [
  `<${API_CATALOG_PATH}>; rel="api-catalog"`,
  `<${API_URL}/spec.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"`,
  `<${API_URL}>; rel="service-doc"; type="text/html"`,
].join(", ");
const API_CATALOG = JSON.stringify({
  linkset: [
    {
      anchor: API_URL,
      "service-desc": [
        {
          href: `${API_URL}/spec.json`,
          type: "application/vnd.oai.openapi+json",
        },
      ],
      "service-doc": [{ href: API_URL, type: "text/html" }],
      status: [{ href: `${API_URL}/health`, type: "application/json" }],
    },
  ],
});

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
      [API_CATALOG_PATH]: () =>
        new Response(API_CATALOG, {
          headers: {
            "Content-Type":
              'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=3600",
          },
        }),
      ...routes,
      // Every real build asset has its own route above. Anything else under
      // /assets/ is a chunk from an older deploy: answer 404 instead of letting
      // the app render an HTML page with a 200, which the CDN would cache as
      // that .js file and break every visitor's (and crawler's) next load.
      "/assets/*": () =>
        new Response("Not Found", {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        }),
      "/*": async (req: Request) => {
        const url = new URL(req.url);
        if (TRAILING_PUNCTUATION.test(url.pathname)) {
          url.pathname = url.pathname.replace(TRAILING_PUNCTUATION, "") || "/";
          return Response.redirect(url.toString(), 301);
        }

        const withPageHeaders = (response: Response) => {
          const noindex = NOINDEX_PATHS.has(url.pathname);
          const isHomepage = url.pathname === "/";
          if (!noindex && !isHomepage) return response;
          // Redirect responses have immutable headers, so copy before setting.
          const copy = new Response(response.body, response);
          if (noindex) copy.headers.set("X-Robots-Tag", "noindex");
          if (isHomepage) copy.headers.append("Link", HOMEPAGE_LINK_HEADER);
          return copy;
        };

        try {
          const response = await handler.fetch(req);
          return withPageHeaders(await toWebResponse(response));
        } catch (error) {
          // Handle TanStack Router redirect throws
          if (
            error &&
            typeof error === "object" &&
            "status" in error &&
            "headers" in error
          ) {
            return withPageHeaders(
              await toWebResponse(error as NodeResponseLike),
            );
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
