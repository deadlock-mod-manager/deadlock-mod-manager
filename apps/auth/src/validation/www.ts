import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  db: z.object({
    alive: z.boolean(),
    error: z.string().optional(),
  }),
  version: z.string(),
});
