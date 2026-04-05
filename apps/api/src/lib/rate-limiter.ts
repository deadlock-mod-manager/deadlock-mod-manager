import { redis } from "./redis";

interface RateLimitConfig {
  /** Maximum number of requests allowed within the window */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the current window resets (from Redis TTL). */
  resetSeconds: number;
  retryAfterSeconds: number;
}

/**
 * Redis-backed fixed-window rate limiter.
 * Uses an atomic Lua script to avoid race conditions between INCR and EXPIRE.
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const redisKey = `rate_limit:${key}`;

  const [current, ttl] = await redis.rateLimit(redisKey, config.windowSeconds);

  const resetSeconds = ttl > 0 ? ttl : config.windowSeconds;

  if (current > config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetSeconds,
      retryAfterSeconds: resetSeconds,
    };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - current,
    resetSeconds,
    retryAfterSeconds: 0,
  };
}
