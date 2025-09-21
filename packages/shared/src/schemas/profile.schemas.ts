import { z } from "zod";

export const profileModFileSchema = z.object({
  name: z.string(),
  path: z.string(),
  size: z.number(),
  is_selected: z.boolean(),
  archive_name: z.string(),
});

export const profileModFileTreeSchema = z.object({
  files: z.array(profileModFileSchema),
  total_files: z.number(),
  has_multiple_files: z.boolean(),
});

export const profileModDownloadSchema = z.object({
  remoteId: z.string(),
  file: z.string(),
  url: z.string(),
  size: z.number(),
});

export const profileModSchema = z.object({
  remoteId: z.string(),
  // Optional: specific download file if mod has multiple downloads
  selectedDownload: profileModDownloadSchema.optional(),
  // Optional: specific VPK file selections if mod has multiple files
  fileTree: profileModFileTreeSchema.optional(),
});

export const v1ProfileSchema = z.object({
  version: z.literal("1"),
  payload: z.object({
    mods: z.array(profileModSchema),
  }),
});

export const profileSchema = z.union([v1ProfileSchema]);

export type SharedProfile = z.infer<typeof profileSchema>;
