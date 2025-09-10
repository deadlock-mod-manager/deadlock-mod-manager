import { z } from 'zod';
import { env } from '@/lib/env';
import { publicProcedure } from '../lib/orpc';
import { HealthService } from '../lib/services/health';
import type { HealthResponse } from '../types/health';
import { version } from '../version';

const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.object({
    alive: z.boolean(),
    error: z.string().optional(),
  }),
});

const VersionResponseSchema = z.object({
  version: z.string(),
});

const StatusResponseSchema = z.object({
  status: z.enum(['operational', 'downtime', 'degraded']),
});

export const publicRouter = {
  healthCheck: publicProcedure
    .route({ method: 'GET', path: '/health' })
    .output(HealthResponseSchema)
    .handler(async (): Promise<HealthResponse> => {
      const service = HealthService.getInstance();
      return await service.check();
    }),

  getVersion: publicProcedure
    .route({ method: 'GET', path: '/version' })
    .output(VersionResponseSchema)
    .handler(async () => {
      try {
        const response = await fetch(
          'https://github.com/Stormix/deadlock-modmanager/releases/latest/download/latest.json',
          {
            headers: { Accept: 'application/json' },
          }
        );

        if (!response.ok) {
          return { version: 'unknown' };
        }

        const data = await response.json();
        return { version: data.version };
      } catch {
        // Fallback to hardcoded version if GitHub fetch fails
        return { version };
      }
    }),

  getStatus: publicProcedure
    .route({ method: 'GET', path: '/status' })
    .output(StatusResponseSchema)
    .handler(async () => {
      try {
        const response = await fetch(
          'https://betteruptime.com/api/v2/status-pages/184676',
          {
            headers: {
              Authorization: `Bearer ${env.BETTERSTACK_API_KEY}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const betterStackStatus = data.data.attributes.aggregate_state;

        // Map betterstack status to our status format
        let status: 'operational' | 'downtime' | 'degraded';
        switch (betterStackStatus.toLowerCase()) {
          case 'operational':
            status = 'operational';
            break;
          case 'degraded':
            status = 'degraded';
            break;
          default:
            status = 'downtime';
        }

        return { status };
      } catch (_error) {
        return { status: 'downtime' as const };
      }
    }),
};
