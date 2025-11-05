import { z } from "zod";

export const envSchema = z.object({
  TZ: z.string().default("Europe/Berlin"),
  PORT: z.coerce.number().min(1).max(65535).default(9000),
  NODE_ENV: z.enum(["development", "production"]).default("production"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
  SENTRY_DSN: z
    .string()
    .url()
    .default(
      "https://68ca3d16310ec3b252293d44ecf5fe21@o84215.ingest.us.sentry.io/4508546052915200",
    ),
  POD_NAME: z.string().optional(),
  CORS_ORIGIN: z.array(z.string()).optional().default([
    "https://deadlockmods.com",
    "https://deadlockmods.app",
    "http://tauri.localhost", // Tauri production build
    "http://localhost:1420", // Tauri dev server
    "http://localhost:3003", // Local web server
  ]),
  REDIS_URL: z.string(),
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().optional(),
  BETTERSTACK_API_KEY: z.string().optional(),
  STEAM_API_KEY: z.string(),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  MIRROR_SERVICE_URL: z
    .string()
    .url("MIRROR_SERVICE_URL must be a valid URL")
    .optional()
    .default("https://mirror.deadlockmods.app"),
});

export const env = envSchema.parse(process.env);

export type Environment = z.infer<typeof envSchema>;
