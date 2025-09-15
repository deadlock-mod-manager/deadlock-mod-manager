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
  BOT_TOKEN: z.string(),
  BOT_ENABLED: z.coerce.boolean().default(false),
  STATUS_CHANNEL_ID: z.string().optional().default('1322369714701205543'),
  STATUS_MESSAGE_ID: z.string().optional().default('1417226755894284368'),
  STATUS_URL: z.string().url().default('https://status.deadlockmods.app/'),
  STATUS_INTERVAL_MIN: z.coerce.number().min(1).default(5),
  STATUS_SELECTOR: z.string().default('main'),
  STATUS_PIN: z.coerce.boolean().default(true),
  STATUS_ENABLED: z.coerce.boolean().default(true),
});

export const env = envSchema.parse(process.env);

export type Environment = z.infer<typeof envSchema>;
