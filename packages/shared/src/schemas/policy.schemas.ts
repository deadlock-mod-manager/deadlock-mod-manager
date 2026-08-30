import { z } from "zod";

export const policyProviderSchema = z.literal("gamebanana");
export const policySubmissionTypeSchema = z.enum(["mod", "sound"]);
export const policyRuleKindSchema = z.enum([
  "hidden",
  "blacklisted",
  "takedown",
  "metadata_correction",
  "emergency_disable",
]);

const policyDonationLinkSchema = z
  .object({
    url: z.string(),
    platform: z.string(),
  })
  .strict();

const policyDownloadCorrectionSchema = z
  .object({
    url: z.string(),
    file: z.string(),
  })
  .strict();

export const policyMetadataCorrectionSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    hero: z.string().optional(),
    isMap: z.boolean().optional(),
    isAudio: z.boolean().optional(),
    isNSFW: z.boolean().optional(),
    isObsolete: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    metadata: z
      .object({
        mapName: z.string().optional(),
        donationLinks: z.array(policyDonationLinkSchema).optional(),
      })
      .strict()
      .optional(),
    downloads: z.array(policyDownloadCorrectionSchema).optional(),
  })
  .strict();

export const policyManifestRuleSchema = z
  .object({
    provider: policyProviderSchema,
    submissionType: policySubmissionTypeSchema,
    submissionId: z.string().regex(/^[1-9]\d*$/),
    kind: policyRuleKindSchema,
    reason: z.string().nullable(),
    correction: policyMetadataCorrectionSchema.nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const policyManifestSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative(),
    generatedAt: z.string().datetime(),
    rules: z.array(policyManifestRuleSchema),
  })
  .strict();

export type PolicyManifest = z.infer<typeof policyManifestSchema>;
export type PolicyManifestRule = z.infer<typeof policyManifestRuleSchema>;
export type PolicyMetadataCorrection = z.infer<
  typeof policyMetadataCorrectionSchema
>;
