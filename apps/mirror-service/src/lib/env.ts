import { z } from "zod";

export const envSchema = z.object({
  TZ: z.string().default("Europe/Berlin"),
  PORT: z.coerce.number().min(1).max(65535).default(3002),
  NODE_ENV: z.enum(["development", "production"]).default("production"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
  SENTRY_DSN: z
    .string()
    .url()
    .default(
      "https://6a3fe299a5b74893055ba05145b62122@o84215.ingest.us.sentry.io/4510217497280512",
    ),
  POD_NAME: z.string().optional(),
  CORS_ORIGIN: z.array(z.string()).optional().default([
    "https://deadlockmods.com",
    "https://deadlockmods.app",
    "http://tauri.localhost", // Tauri production build
    "http://localhost:1420", // Tauri dev server
    "http://localhost:3001", // Local web server
  ]),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_BUCKET: z.string().default("deadlock-mod-manager-mirror"),
  S3_ENDPOINT: z.string(),
  REDIS_URL: z.string().url("REDIS_URL must be a valid URL"),
  VALIDATION_WORKER_INTERVAL_HOURS: z.coerce.number().min(1).max(24).default(1),
  CLEANUP_RETENTION_DAYS: z.coerce.number().min(1).max(365).default(14),
});

export const env = envSchema.parse(Bun.env);

export type Environment = z.infer<typeof envSchema>;
