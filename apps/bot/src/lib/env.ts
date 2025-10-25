import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("production"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  SENTRY_DSN: z
    .string()
    .url()
    .default(
      "https://68ca3d16310ec3b252293d44ecf5fe21@o84215.ingest.us.sentry.io/4508546052915200",
    ),
  POD_NAME: z.string().optional(),
  BOT_TOKEN: z.string(),
  BOT_ENABLED: z.coerce.boolean().default(false),
  STATUS_CHANNEL_ID: z.string().optional().default("1322369714701205543"),
  STATUS_MESSAGE_ID: z.string().optional().default("1417226755894284368"),
  STATUS_URL: z.string().url().default("https://status.deadlockmods.app/"),
  STATUS_INTERVAL_MIN: z.coerce.number().min(1).default(5),
  STATUS_SELECTOR: z.string().default("main"),
  STATUS_PIN: z.coerce.boolean().default(true),
  STATUS_ENABLED: z.coerce.boolean().default(true),
  FORUM_CHANNEL_ID: z.string().default("1412799289301925908"),
  REPORTS_CHANNEL_ID: z.string().default("1421566655338905620"),
  SUPPORT_CHANNEL_ID: z.string().default("1431734280463188100"),
  BUG_REPORT_CHANNEL_ID: z.string().default("1418618964925480990"),
  API_URL: z.string().url().default("https://api.deadlockmods.app"),
  REPORT_MODERATOR_ROLES: z
    .string()
    .default(
      "1322369692962390119,1322369688445124719,1322369689640243201,1322369690902990951",
    )
    .transform((val) => val.split(",").map((id) => id.trim())),
  BLACKLIST_MODERATOR_ROLES: z
    .string()
    .default("1322369688445124719,1322369692962390119")
    .transform((val) =>
      val
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  CORE_CONTRIBUTOR_ROLES: z
    .string()
    .default("1322369692962390119")
    .transform((val) => val.split(",").map((id) => id.trim())),
  OPENAI_API_KEY: z.string(),
  LANGFUSE_SECRET_KEY: z.string(),
  LANGFUSE_PUBLIC_KEY: z.string(),
  LANGFUSE_BASE_URL: z.string().url().default("https://cloud.langfuse.com"),
  DEBUG: z
    .string()
    .default("false")
    .transform((val) => val === "true"),
  DOCS_SYNC_INTERVAL_HOURS: z.coerce.number().min(1).default(24),
  DOCS_URL: z
    .string()
    .url()
    .default("https://docs.deadlockmods.app/llms-full.txt"),
});

export const env = envSchema.parse(process.env);

export type Environment = z.infer<typeof envSchema>;
