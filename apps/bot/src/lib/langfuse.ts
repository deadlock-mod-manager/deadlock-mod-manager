import { LangfuseClient } from "@langfuse/client";
import { env } from "./env";

export const langfuse = new LangfuseClient({
  secretKey: env.LANGFUSE_SECRET_KEY,
  publicKey: env.LANGFUSE_PUBLIC_KEY,
  baseUrl: env.LANGFUSE_BASE_URL,
});
