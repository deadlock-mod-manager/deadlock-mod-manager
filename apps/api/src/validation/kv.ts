import { z } from "zod";

const MAX_KV_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB - reasonable limit for legitimate KV files

export const ParseKvInputSchema = z.object({
  content: z.string().max(MAX_KV_CONTENT_SIZE),
});
