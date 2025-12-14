import type z from "zod";
import type { HealthResponseSchema } from "@/validation/www";

export interface DbHealth {
  alive: boolean;
  error?: string;
}

export interface RedisHealth {
  alive: boolean;
  error?: string;
  configured: boolean;
}

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
