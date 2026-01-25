import type { z } from "zod";
import type { AnalyticsResponseSchema } from "@/validation/www";

export type AnalyticsResponse = z.infer<typeof AnalyticsResponseSchema>;
