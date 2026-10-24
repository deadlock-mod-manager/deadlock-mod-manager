import { z } from "zod";
import { v3ProfileSchema } from "./profile.schemas";

export const MAX_PROFILE_BACKUPS_PER_USER = 50;

export const profileBackupModGroupSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(100),
  modIds: z.array(z.string()).max(2000),
  collapsed: z.boolean(),
});

// Wraps the share format so backups restore through the same import path,
// and adds what sharing leaves out: disabled mods, groups and the description.
export const profileBackupPayloadSchema = z.object({
  version: z.literal("1"),
  profile: v3ProfileSchema,
  disabledModIds: z.array(z.string()).max(2000),
  modGroups: z.array(profileBackupModGroupSchema).max(200),
  description: z.string().max(500).optional(),
  // Shown when a mod has left GameBanana and can no longer be looked up.
  modNames: z.record(z.string(), z.string().max(200)).optional(),
  skippedLocalModCount: z.number().int().nonnegative(),
});

export const profileBackupSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  deviceName: z.string(),
  modCount: z.number().int(),
  skippedLocalModCount: z.number().int(),
  contentHash: z.string(),
  revision: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const profileBackupSchema = profileBackupSummarySchema.extend({
  payload: profileBackupPayloadSchema,
});

export const profileBackupsListResponseSchema = z.array(
  profileBackupSummarySchema,
);

export const profileBackupIdParamSchema = z.object({
  id: z.string(),
});

export const saveProfileBackupInputSchema = z.object({
  // Omitted to create a backup; set with the last seen revision to update one.
  id: z.string().optional(),
  expectedRevision: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(100),
  deviceName: z.string().trim().max(100),
  contentHash: z.string().min(1).max(128),
  payload: profileBackupPayloadSchema,
});

export type ProfileBackupModGroup = z.infer<typeof profileBackupModGroupSchema>;
export type ProfileBackupPayload = z.infer<typeof profileBackupPayloadSchema>;
export type ProfileBackupSummary = z.infer<typeof profileBackupSummarySchema>;
export type ProfileBackup = z.infer<typeof profileBackupSchema>;
export type SaveProfileBackupInput = z.infer<
  typeof saveProfileBackupInputSchema
>;
