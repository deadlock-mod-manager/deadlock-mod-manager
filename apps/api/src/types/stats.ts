import type { z } from "zod";
import type {
  StatsResponseSchema,
  TransparencyStatsResponseSchema,
} from "@/validation/www";

export type StatsResponse = z.infer<typeof StatsResponseSchema>;
export type TransparencyStatsResponse = z.infer<
  typeof TransparencyStatsResponseSchema
>;
