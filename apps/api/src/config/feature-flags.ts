import type { FeatureFlagDefinition } from "@deadlock-mods/feature-flags";

/**
 * Feature flag definitions to be registered on application startup.
 */
export const featureFlagDefinitions: FeatureFlagDefinition[] = [
  {
    name: "profile-sharing",
    description: "Enable profile sharing functionality",
    type: "boolean",
    defaultValue: false,
  },
  {
    name: "profile-management",
    description: "Enable profile management features",
    type: "boolean",
    defaultValue: false,
  },
];
