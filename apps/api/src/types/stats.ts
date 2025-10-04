import type z from "zod";
import type { StatsResponseSchema } from "@/validation/www";

export type StatsResponse = z.infer<typeof StatsResponseSchema>;
