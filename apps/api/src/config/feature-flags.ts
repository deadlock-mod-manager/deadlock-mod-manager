import type { FeatureFlagDefinition } from "@deadlock-mods/feature-flags";

/**
 * Feature flag definitions to be registered on application startup.
 */
export const featureFlagDefinitions: FeatureFlagDefinition[] = [
  {
    name: "remlock-release",
    description:
      "Show Remlock and use it by default for players without a theme",
    type: "boolean",
    defaultValue: false,
    exposed: true,
  },
  {
    name: "seasonal-themes",
    description:
      "Master switch for seasonal themes (Halloween, Christmas, New Year, Lunar New Year, Easter)",
    type: "boolean",
    defaultValue: true,
    exposed: true,
  },
  {
    name: "seasonal-themes-schedule",
    description:
      "Switch seasonal themes on automatically during each festival's window",
    type: "boolean",
    defaultValue: true,
    exposed: true,
  },
  {
    name: "seasonal-theme-force",
    description:
      "Force one seasonal theme regardless of the date (halloween, christmas, new-year, lunar-new-year, easter); empty for none",
    type: "string",
    defaultValue: "",
    exposed: true,
  },
  {
    name: "seasonal-theme-halloween",
    description: "Allow the Halloween seasonal theme",
    type: "boolean",
    defaultValue: true,
    exposed: true,
  },
  {
    name: "seasonal-theme-christmas",
    description: "Allow the Christmas seasonal theme",
    type: "boolean",
    defaultValue: true,
    exposed: true,
  },
  {
    name: "seasonal-theme-new-year",
    description: "Allow the New Year's Eve seasonal theme",
    type: "boolean",
    defaultValue: true,
    exposed: true,
  },
  {
    name: "seasonal-theme-lunar-new-year",
    description: "Allow the Lunar New Year seasonal theme",
    type: "boolean",
    defaultValue: true,
    exposed: true,
  },
  {
    name: "seasonal-theme-easter",
    description: "Allow the Easter seasonal theme",
    type: "boolean",
    defaultValue: true,
    exposed: true,
  },
  {
    name: "mod-download-mirroring",
    description: "Enable mod download mirroring functionality",
    type: "boolean",
    defaultValue: false,
  },
  {
    name: "gamebanana-direct-client",
    description: "Read the desktop mod catalog directly from GameBanana",
    type: "boolean",
    defaultValue: false,
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
