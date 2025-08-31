import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('production'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  SENTRY_DSN: z.string().url().default('https://68ca3d16310ec3b252293d44ecf5fe21@o84215.ingest.us.sentry.io/4508546052915200'),
});

export const env = envSchema.parse(process.env);

export type Environment = z.infer<typeof envSchema>;
