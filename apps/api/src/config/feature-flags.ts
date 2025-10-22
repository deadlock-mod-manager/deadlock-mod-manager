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
  {
    name: "mod-download-mirroring",
    description: "Enable mod download mirroring functionality",
    type: "boolean",
    defaultValue: false,
  },
  {
    name: "show-plugins",
    description: "Show plugins feature in the application",
    type: "boolean",
    defaultValue: false,
  },
  {
    name: "plugin-sudo",
    description: "Enable sudo plugin functionality",
    type: "boolean",
    defaultValue: true,
  },
  {
    name: "plugin-themes",
    description: "Enable themes plugin functionality",
    type: "boolean",
    defaultValue: true,
  },
  {
    name: "plugin-flashbang",
    description: "Enable flashbang plugin functionality",
    type: "boolean",
    defaultValue: true,
  },
  {
    name: "plugin-background",
    description: "Enable background plugin functionality",
    type: "boolean",
    defaultValue: true,
  },
  {
    name: "plugin-discord",
    description: "Enable discord plugin functionality",
    type: "boolean",
    defaultValue: true,
  },
];
