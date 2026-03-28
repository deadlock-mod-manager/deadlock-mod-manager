import { z } from "zod";
import { redis } from "@/lib/redis";

const CHAT_SDK_KEY_PREFIX = "chat-sdk";
const THREAD_STATE_KEY_PREFIX = "thread-state:";
const THREAD_STATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const supportThreadStateSchema = z
  .object({ escalated: z.boolean().optional() })
  .passthrough();

interface SupportThreadState {
  escalated?: boolean;
}

function parseThreadStateFromRedis(raw: string): SupportThreadState {
  try {
    const data = JSON.parse(raw);
    const result = supportThreadStateSchema.safeParse(data);
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}

export async function markSupportThreadEscalated(
  threadId: string,
): Promise<void> {
  const redisKey = `${CHAT_SDK_KEY_PREFIX}:cache:${THREAD_STATE_KEY_PREFIX}${threadId}`;
  const raw = await redis.get(redisKey);
  const existing = raw === null ? {} : parseThreadStateFromRedis(raw);
  const merged = { ...existing, escalated: true };
  await redis.set(redisKey, JSON.stringify(merged), "PX", THREAD_STATE_TTL_MS);
}
