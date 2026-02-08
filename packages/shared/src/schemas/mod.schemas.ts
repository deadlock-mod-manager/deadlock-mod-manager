import { z } from "zod";

// Helper for date fields that may come as strings from cache (JSON serialization)
const coercedDate = z.coerce.date();
const coercedDateNullable = z.coerce.date().nullable();

// ModDto schema (matches the raw Mod type from database)
export const ModDtoSchema = z.object({
  id: z.string(),
  remoteId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  remoteUrl: z.string(),
  category: z.string(),
  likes: z.number().int(),
  author: z.string(),
  downloadable: z.boolean(),
  remoteAddedAt: coercedDate,
  remoteUpdatedAt: coercedDate,
  tags: z.array(z.string()),
  images: z.array(z.string()),
  hero: z.string().nullable(),
  isAudio: z.boolean(),
  audioUrl: z.string().nullable(),
  downloadCount: z.number().int(),
  isNSFW: z.boolean(),
  filesUpdatedAt: coercedDateNullable,
  createdAt: coercedDateNullable,
  updatedAt: coercedDateNullable,
});

// ModDownloadDto schema (matches the transformed output from toModDownloadDto)
export const ModDownloadDtoSchema = z.object({
  url: z.string(),
  size: z.number().int(),
  name: z.string(), // This comes from the 'file' field in the database
  createdAt: coercedDateNullable,
  updatedAt: coercedDateNullable,
  md5Checksum: z.string().nullable(),
});

// CustomSettingDto schema (matches the raw CustomSetting type from database)
export const CustomSettingDtoSchema = z.object({
  id: z.string(),
  key: z.string(),
  value: z.string(),
  type: z.string(),
  description: z.string().nullable(),
  createdAt: coercedDate,
  updatedAt: coercedDate,
});

// Input schemas for route parameters
export const ModIdParamSchema = z.object({
  id: z.string(),
});

// API response schemas
export const ModsListResponseSchema = z.array(ModDtoSchema);
export const ModDownloadsResponseSchema = z.array(ModDownloadDtoSchema);
export const CustomSettingsResponseSchema = z.array(CustomSettingDtoSchema);

// V2 downloads response with count
export const ModDownloadsV2ResponseSchema = z.object({
  downloads: z.array(ModDownloadDtoSchema),
  count: z.number().int(),
});

export const ErrorResponseSchema = z.object({
  error: z.string(),
});

// Check updates schemas
export const CheckUpdatesInputSchema = z.object({
  mods: z.array(
    z.object({
      remoteId: z.string(),
      installedAt: coercedDate,
    }),
  ),
});

export const CheckUpdatesResponseSchema = z.object({
  updates: z.array(
    z.object({
      mod: ModDtoSchema,
      downloads: z.array(ModDownloadDtoSchema),
    }),
  ),
});

export const ModSchema = ModDtoSchema;
export const ModDownloadSchema = ModDownloadDtoSchema;
export const CustomSettingSchema = CustomSettingDtoSchema;
