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
  // Optional: specific download file if mod has multiple downloads (legacy, single file)
  selectedDownload: profileModDownloadSchema.optional(),
  // Optional: specific download files if mod has multiple downloads
  selectedDownloads: z.array(profileModDownloadSchema).optional(),
  // Optional: specific VPK file selections if mod has multiple files
  fileTree: profileModFileTreeSchema.optional(),
});

export const v1ProfileSchema = z.object({
  version: z.literal("1"),
  payload: z.object({
    mods: z.array(profileModSchema),
  }),
});

export const v2ProfileSchema = z.object({
  version: z.literal("2"),
  payload: z.object({
    mods: z.array(profileModSchema),
    loadOrder: z.array(z.string()),
  }),
});

export const profileSchema = z.union([v1ProfileSchema, v2ProfileSchema]);

export type SharedProfile = z.infer<typeof profileSchema>;
type SharedProfileMod = z.infer<typeof profileModSchema>;
export type ProfileModDownload = z.infer<typeof profileModDownloadSchema>;

export const getSharedProfileLoadOrder = (profile: SharedProfile): string[] => {
  const availableModIds = new Set(
    profile.payload.mods.map((mod) => mod.remoteId),
  );
  const explicitLoadOrder =
    profile.version === "2" ? profile.payload.loadOrder : [];
  const normalizedLoadOrder: string[] = [];
  const seenModIds = new Set<string>();

  for (const remoteId of explicitLoadOrder) {
    if (!availableModIds.has(remoteId) || seenModIds.has(remoteId)) {
      continue;
    }

    normalizedLoadOrder.push(remoteId);
    seenModIds.add(remoteId);
  }

  for (const mod of profile.payload.mods) {
    if (seenModIds.has(mod.remoteId)) {
      continue;
    }

    normalizedLoadOrder.push(mod.remoteId);
    seenModIds.add(mod.remoteId);
  }

  return normalizedLoadOrder;
};

export const getOrderedSharedProfileMods = (
  profile: SharedProfile,
): SharedProfileMod[] => {
  const modsByRemoteId = new Map(
    profile.payload.mods.map((mod) => [mod.remoteId, mod]),
  );

  return getSharedProfileLoadOrder(profile)
    .map((remoteId) => modsByRemoteId.get(remoteId))
    .filter((mod): mod is SharedProfileMod => mod !== undefined);
};
