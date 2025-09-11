import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('production'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  SENTRY_DSN: z
    .string()
    .url()
    .default(
      'https://68ca3d16310ec3b252293d44ecf5fe21@o84215.ingest.us.sentry.io/4508546052915200'
    ),
  POD_NAME: z.string().optional(),
  CORS_ORIGIN: z.array(z.string()).optional().default([
    'https://deadlockmods.com',
    'https://deadlockmods.app',
    'http://tauri.localhost', // Tauri production build
    'http://localhost:1420', // Tauri dev server
  ]),
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().optional(),
  BETTERSTACK_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export type Environment = z.infer<typeof envSchema>;
