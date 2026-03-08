import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const defaultDocsPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
  "apps",
  "docs",
  "content",
  "docs",
);

const envSchema = z.object({
  PORT: z.coerce.number().default(4111),
  DATABASE_URL: z.string(),
  DEFAULT_MODEL: z.string().default("openrouter/moonshotai/kimi-k2.5"),
  GUARDRAILS_MODEL: z.string().default("openrouter/openai/gpt-4o-mini"),
  OPENROUTER_API_KEY: z.string(),
  GITHUB_PERSONAL_ACCESS_TOKEN: z.string(),
  DISCORD_TOKEN: z.string(),
  TRUSTED_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:4111")
    .transform((val) => val.split(",").map((origin) => origin.trim())),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().default(10_000),
  WORKSPACE_PATH: z.string().default("./workspace"),
  BRAVE_API_KEY: z.string(),
  DOCS_PATH: z.string().default(defaultDocsPath),
  EMBEDDING_MODEL: z.string().default("openai/text-embedding-3-small"),
});

export type Env = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);
