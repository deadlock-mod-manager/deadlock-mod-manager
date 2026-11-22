import { redis } from "./redis";

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
  retryAfterSeconds: number;
}

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
