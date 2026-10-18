import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("production"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
  SENTRY_DSN: z
    .string()
    .url()
    .default(
      "https://640faf56b1e2ec9dd4ff293e3ee12307@o84215.ingest.us.sentry.io/4510018253946880",
    ),
  POD_NAME: z.string().optional(),
  REDIS_URL: z.string(),
  // Downloads stream to disk, so several can overlap cheaply
  LOCKDEX_DOWNLOAD_CONCURRENCY: z.coerce.number().int().positive().default(8),
  // Extraction and VPK hashing hold archive data in memory; keep this low
  LOCKDEX_PROCESSING_CONCURRENCY: z.coerce.number().int().positive().default(1),
  LOCKDEX_METRICS_PORT: z.coerce.number().int().positive().default(9100),
});

export const env = envSchema.parse(process.env);

export type Environment = z.infer<typeof envSchema>;
