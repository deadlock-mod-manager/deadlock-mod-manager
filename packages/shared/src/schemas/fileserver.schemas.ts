import { z } from "zod";

const FileserverStateSchema = z.enum(["up", "down", "terminated"]);

const FileserverStatsSchema = z.object({
  rateBytes: z.number(),
  requestsPerHour: z.number(),
});

const FileserverGeoSchema = z.object({
  country: z.string(),
  city: z.string(),
});

const FileserverDtoSchema = z.object({
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

const FileserverLatencyResultSchema = z.object({
  id: z.string(),
  latencyMs: z.number().nullable(),
  reachable: z.boolean(),
});

export type FileserverDto = z.infer<typeof FileserverDtoSchema>;
export type FileserverGeo = z.infer<typeof FileserverGeoSchema>;
export type FileserverLatencyResult = z.infer<
  typeof FileserverLatencyResultSchema
>;
