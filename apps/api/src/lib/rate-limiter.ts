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
  retryAfterSeconds: number;
}

/**
 * Redis-backed sliding window rate limiter.
 * Uses INCR + EXPIRE for a simple fixed-window counter per key.
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const redisKey = `rate_limit:${key}`;

  const current = await redis.incr(redisKey);

  if (current === 1) {
    await redis.expire(redisKey, config.windowSeconds);
  }

  if (current > config.maxRequests) {
    const ttl = await redis.ttl(redisKey);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: ttl > 0 ? ttl : config.windowSeconds,
    };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - current,
    retryAfterSeconds: 0,
  };
}
