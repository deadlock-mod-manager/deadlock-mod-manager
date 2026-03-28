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

export const aiConfigSchema = z.object({
  DATABASE_URL: z.string(),
  DEFAULT_MODEL: z.string().default("openrouter/moonshotai/kimi-k2.5"),
  GUARDRAILS_MODEL: z.string().default("openrouter/openai/gpt-4o-mini"),
  OPENROUTER_API_KEY: z.string(),
  BRAVE_API_KEY: z.string(),
  BOT_TOKEN: z.string(),
  DOCS_PATH: z.string().default(defaultDocsPath),
  EMBEDDING_MODEL: z.string().default("openai/text-embedding-3-small"),
});

export type AiConfig = z.infer<typeof aiConfigSchema>;
