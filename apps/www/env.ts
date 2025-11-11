import { z } from "zod";

export const envSchema = z.object({
  PORT: z.coerce.number().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "production"]).default("production"),
  ASSET_PRELOAD_MAX_SIZE: z.coerce
    .number()
    .min(0)
    .default(5 * 1024 * 1024),
  ASSET_PRELOAD_INCLUDE_PATTERNS: z
    .string()
    .optional()
    .default("")
    .transform((val) =>
      val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ASSET_PRELOAD_EXCLUDE_PATTERNS: z
    .string()
    .optional()
    .default("")
    .transform((val) =>
      val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ASSET_PRELOAD_VERBOSE_LOGGING: z
    .string()
    .optional()
    .default("false")
    .transform((val) => val === "true"),
  ASSET_PRELOAD_ENABLE_ETAG: z
    .string()
    .optional()
    .default("true")
    .transform((val) => val === "true"),
  ASSET_PRELOAD_ENABLE_GZIP: z
    .string()
    .optional()
    .default("true")
    .transform((val) => val === "true"),
  ASSET_PRELOAD_GZIP_MIN_SIZE: z.coerce.number().min(0).default(1024),
  ASSET_PRELOAD_GZIP_MIME_TYPES: z
    .string()
    .optional()
    .default(
      "text/,application/javascript,application/json,application/xml,image/svg+xml",
    )
    .transform((val) =>
      val
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    ),
});

export const env = envSchema.parse(process.env);

export type Environment = z.infer<typeof envSchema>;
