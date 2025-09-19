import { z } from "zod";

export const profileModSchema = z.object({
  remoteId: z.string(),
});

export const v1ProfileSchema = z.object({
  version: z.literal("1"),
  payload: z.object({
    mods: z.array(profileModSchema),
  }),
});

export const profileSchema = z.union([v1ProfileSchema]);

export type SharedProfile = z.infer<typeof profileSchema>;
