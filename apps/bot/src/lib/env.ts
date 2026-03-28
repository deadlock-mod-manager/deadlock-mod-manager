import { aiConfigSchema } from "@deadlock-mods/ai";
import { z } from "zod";

// Mastra / docs-ingest: same keys as packages/ai aiConfigSchema except DATABASE_URL (validated above).
const aiEnvWithoutDatabaseUrl = aiConfigSchema.omit({ DATABASE_URL: true });

export const envSchema = z
  .object({
    TRUSTED_ORIGINS: z
      .array(z.string())
      .default([
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:4111",
      ]),
    NODE_ENV: z.enum(["development", "production"]).default("production"),
    PORT: z.coerce.number().default(3001),
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
    FORUM_CHANNEL_ID: z.string().default("1412799289301925908"),
    REPORTS_CHANNEL_ID: z.string().default("1421566655338905620"),
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
    DISCORD_OWNER_ID: z.string().default("447912513653309442"),
    CORE_CONTRIBUTOR_ROLES: z
      .string()
      .default("1322369692962390119")
      .transform((val) => val.split(",").map((id) => id.trim())),
    DISCORD_APPLICATION_ID: z.string().default("1417209944851222528"),
    DISCORD_PUBLIC_KEY: z
      .string()
      .default(
        "9b427052383a21f04923e7007d4e203483f2f714cf34ceb5f7cfaf6d8c826d78",
      ),
  })
  .merge(aiEnvWithoutDatabaseUrl);

export const env = envSchema.parse(process.env);

export type Environment = z.infer<typeof envSchema>;
