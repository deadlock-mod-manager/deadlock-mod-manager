import { z } from "zod";

export const basicInfoSchema = z.object({
  name: z.string().min(1, "Name is required"),
  displayName: z.string().min(1, "Display name is required"),
  version: z.string().min(1, "Version is required"),
  description: z.string().min(1, "Description is required"),
  gameVersion: z.string().optional(),
  license: z.string().optional(),
  homepage: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  repository: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  readme: z.string().optional(),
  screenshots: z.array(z.string()).optional(),
});
