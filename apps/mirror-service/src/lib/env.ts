import { z } from "zod";

export const envSchema = z.object({
  PORT: z.coerce.number().min(1).max(65535).default(3002),
  NODE_ENV: z.enum(["development", "production"]).default("production"),
  DATABASE_URL: z.string(),
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
    "http://localhost:3003", // Local web server
  ]),
});

export const env = envSchema.parse(Bun.env);

export type Environment = z.infer<typeof envSchema>;
