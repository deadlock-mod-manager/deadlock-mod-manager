import { z } from "zod";

export const FeatureFlagTypeSchema = z.enum([
  "boolean",
  "string",
  "number",
  "json",
]);

export const FeatureFlagSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: FeatureFlagTypeSchema,
  value: z.unknown(),
  enabled: z.unknown(), // Backwards compatibility
  exposed: z.boolean(),
});

export const FeatureFlagsResponseSchema = z.array(FeatureFlagSchema);

export const SetUserOverrideInputSchema = z.object({
  value: z.unknown(),
});

export const FlagIdParamSchema = z.object({
  flagId: z.string(),
});

export type FeatureFlagType = z.infer<typeof FeatureFlagTypeSchema>;
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;
export type FeatureFlagsResponse = z.infer<typeof FeatureFlagsResponseSchema>;
export type SetUserOverrideInput = z.infer<typeof SetUserOverrideInputSchema>;
export type FlagIdParam = z.infer<typeof FlagIdParamSchema>;
