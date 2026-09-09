import { z } from "zod";

// Helper for date fields that may come as strings from cache (JSON serialization)
const coercedDate = z.coerce.date();
const coercedDateNullable = z.coerce.date().nullable();

export const ModDependencySchema = z.object({
  label: z.string(),
  url: z.string().nullable(),
  remoteId: z.string().nullable(),
  level: z.enum(["required", "recommended"]).nullable(),
});

// Canonical catalog model normalized by the desktop GameBanana client.
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
  isMap: z.boolean().default(false),
  audioUrl: z.string().nullable(),
  downloadCount: z.number().int(),
  isNSFW: z.boolean(),
  isObsolete: z.boolean().default(false),
  isBlacklisted: z.boolean().default(false),
  blacklistReason: z.string().nullable().default(null),
  blacklistedAt: coercedDateNullable.default(null),
  blacklistedBy: z.string().nullable().default(null),
  filesUpdatedAt: coercedDateNullable,
  metadata: z
    .object({
      mapName: z.string().optional(),
      donationLinks: z
        .array(
          z.object({
            url: z.string(),
            platform: z.string(),
          }),
        )
        .optional(),
    })
    .nullable()
    .optional(),
  dependencies: z.array(ModDependencySchema).nullable().optional(),
  overrides: z.null().default(null),
  createdAt: coercedDateNullable,
  updatedAt: coercedDateNullable,
});

// Canonical archive model normalized by the desktop GameBanana client.
export const ModDownloadDtoSchema = z.object({
  url: z.string(),
  size: z.number().int(),
  name: z.string(),
  description: z.string().nullable().optional(),
  createdAt: coercedDateNullable,
  updatedAt: coercedDateNullable,
  md5Checksum: z.string().nullable(),
});

export type ModDependency = z.infer<typeof ModDependencySchema>;
export type ModDto = z.infer<typeof ModDtoSchema>;
export type ModDownloadDto = z.infer<typeof ModDownloadDtoSchema>;
