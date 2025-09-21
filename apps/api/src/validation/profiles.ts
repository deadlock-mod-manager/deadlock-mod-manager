import { profileSchema } from "@deadlock-mods/shared";
import { z } from "zod";

export const GetProfileInputSchema = z.object({
  id: z.string(),
});

export const ShareProfileInputSchema = z.object({
  hardwareId: z.string(),
  name: z.string(),
  version: z.string(),
  profile: profileSchema,
});

export const ShareProfileOutputSchema = z.object({
  id: z.string().nullable(),
  status: z.enum(["success", "error"]),
  error: z.string().optional(),
});
