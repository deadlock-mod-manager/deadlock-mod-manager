import "reflect-metadata";
import "./instrument";

import { prometheus } from "@hono/prometheus";
import { sentry } from "@hono/sentry";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { etag } from "hono/etag";
import { logger as loggerMiddleware } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { trimTrailingSlash } from "hono/trailing-slash";
import { auth } from "./lib/auth";
import { SENTRY_OPTIONS } from "./lib/constants";
import container from "./lib/container";
import { isDevAuthEnabled } from "./lib/dev-auth";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { HealthService } from "./services/health";

const { printMetrics, registerMetrics } = prometheus();

const app = new Hono();

app.use(
  "*",
  requestId(),
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
  sentry({
    ...SENTRY_OPTIONS,
  }),
  etag(),
  loggerMiddleware((message: string, ...rest: string[]) => {
    logger.info(message, ...rest);
  }),
  secureHeaders(),
  trimTrailingSlash(),
);

app.use("*", registerMetrics);
app.get("/metrics", printMetrics);

app.on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw));
app.get("/health", async (c) => {
  const healthService = container.resolve(HealthService);
  const result = await healthService.check();
  return c.json(result, result.status === "ok" ? 200 : 503);
});

/**
 * Validates and sanitizes a redirect URL to prevent open redirect attacks.
 * Allows only relative paths or URLs matching trusted origins from CORS_ORIGIN.
 * Returns the safe redirect URL or "/" if validation fails.
 */
function validateRedirectUrl(returnTo: string, baseURL: string): string {
  const DEFAULT_REDIRECT = "/";
  const trustedOrigins = env.CORS_ORIGIN;

  if (!returnTo || returnTo === "/") {
    return DEFAULT_REDIRECT;
  }

  // Allow relative paths starting with "/" (but not "//" which could be protocol-relative)
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    try {
      // Normalize the path using URL parsing to handle encoded characters
      const normalized = new URL(returnTo, baseURL);
      // Ensure the normalized URL still belongs to the base origin
      if (normalized.origin === new URL(baseURL).origin) {
        return normalized.pathname + normalized.search + normalized.hash;
      }
    } catch {
      logger.withMetadata({ returnTo }).warn("Invalid relative redirect URL");
    }
    return DEFAULT_REDIRECT;
  }

  // For absolute URLs, validate against trusted origins
  try {
    const parsedUrl = new URL(returnTo);

    // Check if the origin matches any trusted origin
    const isTrustedOrigin = trustedOrigins.some((trustedOrigin) => {
      try {
        const trusted = new URL(trustedOrigin);
        return parsedUrl.origin === trusted.origin;
      } catch {
        return false;
      }
    });

    if (isTrustedOrigin) {
      return returnTo;
    }

    logger
      .withMetadata({ returnTo, origin: parsedUrl.origin })
      .warn("Redirect URL blocked: untrusted origin");
  } catch {
    logger.withMetadata({ returnTo }).warn("Invalid redirect URL format");
  }

  return DEFAULT_REDIRECT;
}

app.get("/login", async (c, next) => {
  const returnTo = c.req.query("returnTo") || "/";
  const baseURL = env.BETTER_AUTH_URL || `http://localhost:${env.PORT}`;

  const sessionResponse = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (sessionResponse?.session) {
    const safeReturnTo = validateRedirectUrl(returnTo, baseURL);
    const redirectUrl = safeReturnTo.startsWith("http")
      ? safeReturnTo
      : `${baseURL}${safeReturnTo.startsWith("/") ? "" : "/"}${safeReturnTo}`;
    return c.redirect(redirectUrl);
  }

  return next();
});

// Logout endpoint for dev auth - clears the better-auth session cookie
if (isDevAuthEnabled()) {
  app.get("/logout", async (c) => {
    const returnTo = c.req.query("returnTo") || "/";
    const baseURL = env.BETTER_AUTH_URL || `http://localhost:${env.PORT}`;

    // Call better-auth's sign-out to clear the session
    const signOutResponse = await auth.api.signOut({
      headers: c.req.raw.headers,
    });

    // Get the Set-Cookie headers from the sign-out response
    const setCookieHeaders = signOutResponse?.headers?.getSetCookie?.() || [];

    const safeReturnTo = validateRedirectUrl(returnTo, baseURL);
    const redirectUrl = safeReturnTo.startsWith("http")
      ? safeReturnTo
      : `${baseURL}${safeReturnTo.startsWith("/") ? "" : "/"}${safeReturnTo}`;

    // Create redirect response with the sign-out cookies
    const response = c.redirect(redirectUrl, 302);

    // Forward the Set-Cookie headers to clear the session cookie
    for (const cookie of setCookieHeaders) {
      response.headers.append("Set-Cookie", cookie);
    }

    return response;
  });
}

app.use("/assets/*", serveStatic({ root: "./dist/client/" }));
app.get("*", serveStatic({ path: "./dist/client/index.html" }));

const main = async () => {
  logger.info(`Auth Server started on port ${env.PORT}`);

  Bun.serve({
    port: env.PORT,
    fetch: app.fetch,
  });
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error("Error starting the application");
    process.exit(1);
  });
}
