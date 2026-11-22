import { z } from "zod";

export const ModFilesUpdatedEventDataSchema = z.object({
  provider: z.literal("gamebanana"),
  submissionType: z.enum(["mod", "sound"]),
  submissionId: z.string().regex(/^[1-9]\d*$/),
  slug: z.string().regex(/^(?:snd-)?[1-9]\d*$/),
  modName: z.string(),
  filesUpdatedAt: z.string().datetime(),
});

export const ModFilesUpdatedEventSchema = z.object({
  type: z.literal("mod_files_updated"),
  data: ModFilesUpdatedEventDataSchema,
});

export const ModEventSchema = ModFilesUpdatedEventSchema;

export type ModEvent = z.infer<typeof ModEventSchema>;

export type ModFilesUpdatedEventData = z.infer<
  typeof ModFilesUpdatedEventDataSchema
>;
export type ModFilesUpdatedEvent = z.infer<typeof ModFilesUpdatedEventSchema>;

export const REDIS_CHANNELS = {
  MOD_FILES_UPDATED: "deadlock:mod_files_updated",
} as const;

export type RedisChannel = (typeof REDIS_CHANNELS)[keyof typeof REDIS_CHANNELS];

export const parseModEvent = (data: unknown): ModEvent => {
  return ModEventSchema.parse(data);
};

export const parseModFilesUpdatedEvent = (
  data: unknown,
): ModFilesUpdatedEvent => {
  return ModFilesUpdatedEventSchema.parse(data);
};
