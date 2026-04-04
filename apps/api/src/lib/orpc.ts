import { ORPCError, os } from "@orpc/server";
import type { Context } from "./context";
import { checkRateLimit } from "./rate-limiter";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      session: context.session,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);

const requireAdmin = o.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }

  const user = context.session.user as typeof context.session.user & {
    isAdmin?: boolean;
  };

  if (!user.isAdmin) {
    throw new ORPCError("FORBIDDEN", {
      message: "Admin access required",
    });
  }

  return next({
    context: {
      session: context.session,
    },
  });
});

export const adminProcedure = protectedProcedure.use(requireAdmin);

interface RateLimitOptions {
  maxRequests: number;
  windowSeconds: number;
}

/**
 * Creates an oRPC middleware that enforces a per-key rate limit using Redis.
 * The key is derived from the procedure path to scope limits per endpoint.
 */
export function createRateLimitMiddleware(options: RateLimitOptions) {
  return o.middleware(async ({ path, next }) => {
    const key = path.join(".");

    const result = await checkRateLimit(key, {
      maxRequests: options.maxRequests,
      windowSeconds: options.windowSeconds,
    });

    if (!result.allowed) {
      throw new ORPCError("TOO_MANY_REQUESTS", {
        message: `Rate limit exceeded. Try again in ${result.retryAfterSeconds} seconds`,
      });
    }

    return next({});
  });
}
