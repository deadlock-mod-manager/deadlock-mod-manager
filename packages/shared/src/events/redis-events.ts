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

export const ModEventSchema = z.union([NewModEventSchema]);

/**
 * TypeScript types derived from Zod schemas
 */
export type NewModEventData = z.infer<typeof NewModEventDataSchema>;
export type NewModEvent = z.infer<typeof NewModEventSchema>;
export type ModEvent = z.infer<typeof ModEventSchema>;

/**
 * Redis channel constants for pub/sub communication
 */
export const REDIS_CHANNELS = {
  NEW_MODS: "deadlock:new_mods",
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
