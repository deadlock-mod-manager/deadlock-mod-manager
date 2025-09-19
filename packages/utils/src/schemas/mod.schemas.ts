import { z } from "zod";

// These schemas match the DTO output types exactly

// ModDto schema (matches the raw Mod type from database)
export const ModDtoSchema = z.object({
  id: z.string(),
  remoteId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  remoteUrl: z.string(),
  category: z.string(),
  likes: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
  author: z.string(),
  downloadable: z.boolean(),
  remoteAddedAt: z.date(),
  remoteUpdatedAt: z.date(),
  tags: z.array(z.string()),
  images: z.array(z.string()),
  hero: z.string().nullable(),
  isAudio: z.boolean(),
  audioUrl: z.string().nullable(),
  downloadCount: z.number().int(),
  isNSFW: z.boolean(),
});

// ModDownloadDto schema (matches the transformed output from toModDownloadDto)
export const ModDownloadDtoSchema = z.object({
  url: z.string(),
  size: z.number().int(),
  name: z.string(), // This comes from the 'file' field in the database
  createdAt: z.date(),
  updatedAt: z.date(),
});

// CustomSettingDto schema (matches the raw CustomSetting type from database)
export const CustomSettingDtoSchema = z.object({
  id: z.string(),
  key: z.string(),
  value: z.string(),
  type: z.string(),
  description: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
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

export const ModSchema = ModDtoSchema;
export const ModDownloadSchema = ModDownloadDtoSchema;
export const CustomSettingSchema = CustomSettingDtoSchema;
