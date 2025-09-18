#!/usr/bin/env bun
import IORedis from 'ioredis';
import { env } from './lib/env';
import { logger } from './lib/logger';

const healthCheck = async (): Promise<void> => {
  let redis: IORedis | undefined;

  try {
    redis = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      commandTimeout: 3000,
      lazyConnect: false,
    });

    const pong = await redis.ping();
    if (pong !== 'PONG') {
      throw new Error('Redis ping failed');
    }

    const testKey = 'lockdex:health:check';
    const testValue = Date.now().toString();

    await redis.set(testKey, testValue, 'EX', 10);
    const retrievedValue = await redis.get(testKey);

    if (retrievedValue !== testValue) {
      throw new Error('Redis read/write test failed');
    }

    await redis.del(testKey);

    logger.info('Health check passed');
  } catch (error) {
    logger.withError(error as Error).error('Health check failed');
    throw error;
  } finally {
    if (redis) {
      await redis.quit();
    }
  }
};

// Run health check if this script is executed directly
if (import.meta.main) {
  healthCheck()
    .then(() => {
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}
