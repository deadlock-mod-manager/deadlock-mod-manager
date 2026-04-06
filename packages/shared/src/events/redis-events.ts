import { z } from "zod";

/**
 * Zod schemas for Redis pub/sub events to ensure runtime safety
 */

export const NewModEventDataSchema = z.object({
  id: z.string(),
  title: z.string(),
  link: z.string().url(),
  pubDate: z.string().datetime(),
  image: z.string().url().optional(),
  source: z.literal("gamebanana"),
});

export const NewModEventSchema = z.object({
  type: z.literal("new_mod"),
  data: NewModEventDataSchema,
});

export const ReportEventDataSchema = z.object({
  id: z.string(),
  modId: z.string(),
  modName: z.string(),
  modAuthor: z.string(),
  createdAt: z.string().datetime().optional(),
});

export const NewReportEventSchema = z.object({
  type: z.literal("new_report"),
  data: ReportEventDataSchema,
});

export const ModFilesUpdatedEventDataSchema = z.object({
  modId: z.string(),
  remoteId: z.string(),
  modName: z.string(),
  filesUpdatedAt: z.string().datetime(),
});

export const ModFilesUpdatedEventSchema = z.object({
  type: z.literal("mod_files_updated"),
  data: ModFilesUpdatedEventDataSchema,
});

export const ModEventSchema = z.union([
  NewModEventSchema,
  ModFilesUpdatedEventSchema,
]);

/**
 * TypeScript types derived from Zod schemas
 */
export type NewModEventData = z.infer<typeof NewModEventDataSchema>;
export type NewModEvent = z.infer<typeof NewModEventSchema>;
export type ModEvent = z.infer<typeof ModEventSchema>;

export type ReportEventData = z.infer<typeof ReportEventDataSchema>;
export type NewReportEvent = z.infer<typeof NewReportEventSchema>;
export type ModFilesUpdatedEventData = z.infer<
  typeof ModFilesUpdatedEventDataSchema
>;
export type ModFilesUpdatedEvent = z.infer<typeof ModFilesUpdatedEventSchema>;

/**
 * Redis channel constants for pub/sub communication
 */
export const REDIS_CHANNELS = {
  NEW_MODS: "deadlock:new_mods",
  NEW_REPORTS: "deadlock:new_reports",
  MOD_FILES_UPDATED: "deadlock:mod_files_updated",
} as const;

export type RedisChannel = (typeof REDIS_CHANNELS)[keyof typeof REDIS_CHANNELS];

/**
 * Utility functions for event validation
 */
export const parseModEvent = (data: unknown): ModEvent => {
  return ModEventSchema.parse(data);
};

export const parseNewModEvent = (data: unknown): NewModEvent => {
  return NewModEventSchema.parse(data);
};

export const parseNewReportEvent = (data: unknown): NewReportEvent => {
  return NewReportEventSchema.parse(data);
};

export const parseModFilesUpdatedEvent = (
  data: unknown,
): ModFilesUpdatedEvent => {
  return ModFilesUpdatedEventSchema.parse(data);
};
