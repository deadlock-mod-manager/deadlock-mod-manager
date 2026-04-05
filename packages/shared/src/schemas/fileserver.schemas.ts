import { z } from "zod";

export const FileserverStateSchema = z.enum(["up", "down", "terminated"]);

export const FileserverStatsSchema = z.object({
  rateBytes: z.number(),
  requestsPerHour: z.number(),
});

export const FileserverGeoSchema = z.object({
  country: z.string(),
  city: z.string(),
});

export const FileserverDtoSchema = z.object({
  id: z.string(),
  provider: z.string(),
  domain: z.string(),
  name: z.string(),
  state: FileserverStateSchema,
  urlTemplate: z.string(),
  stats: FileserverStatsSchema.optional(),
  geo: FileserverGeoSchema.optional(),
});

export const FileserversResponseSchema = z.array(FileserverDtoSchema);

export const FileserverLatencyRequestSchema = z.object({
  id: z.string(),
  testUrl: z.string(),
});

export const FileserverLatencyResultSchema = z.object({
  id: z.string(),
  latencyMs: z.number().nullable(),
  reachable: z.boolean(),
});

export const FileserverLatencyInputSchema = z.object({
  servers: z.array(FileserverLatencyRequestSchema),
});

export type FileserverDto = z.infer<typeof FileserverDtoSchema>;
export type FileserverGeo = z.infer<typeof FileserverGeoSchema>;
export type FileserverLatencyRequest = z.infer<
  typeof FileserverLatencyRequestSchema
>;
export type FileserverLatencyResult = z.infer<
  typeof FileserverLatencyResultSchema
>;
