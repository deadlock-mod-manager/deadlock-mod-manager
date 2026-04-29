import type { CustomThemePalette } from "./types";
import { hslToHex } from "./theme-color-utils";

export const DEFAULT_CUSTOM_THEME: CustomThemePalette = {
  lineColor: hslToHex(0, 0, 14.9),
  accentColor: hslToHex(42, 60, 84),
  cardColor: hslToHex(20, 8, 9),
  popoverColor: hslToHex(20, 9, 6),
  secondaryColor: hslToHex(15, 10, 16),
  mutedColor: hslToHex(0, 0, 14.9),
  foregroundColor: hslToHex(38, 65, 97),
  mutedForegroundColor: hslToHex(0, 0, 63.9),
  sidebarOpacity: 0,
  ambientBackgroundEnabled: false,
  ambientAccentColor: hslToHex(42, 60, 84),
  ambientIntensity: 14,
  ambientSpread: 4,
  cornerRadiusPx: 8,
};
