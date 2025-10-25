import { LangfuseClient } from "@langfuse/client";
import { configureGlobalLogger, LogLevel } from "@langfuse/core";
import { env } from "./env";

configureGlobalLogger({
  level: env.DEBUG ? LogLevel.DEBUG : LogLevel.INFO,
});

export const langfuse = new LangfuseClient({
  secretKey: env.LANGFUSE_SECRET_KEY,
  publicKey: env.LANGFUSE_PUBLIC_KEY,
  baseUrl: env.LANGFUSE_BASE_URL,
});
