import {
  formatHslTriple,
  hexToRgb,
  rgbToHslTriplet,
} from "../../custom/theme-color-utils";

export const DEFAULT_CODING_ACCENT = "#34D399";

export const CODING_ACCENT_PRESETS = [
  DEFAULT_CODING_ACCENT,
  "#38BDF8",
  "#A78BFA",
  "#F472B6",
  "#FB923C",
  "#FBBF24",
  "#F87171",
  "#E5E7EB",
] as const;

function linearizeChannel(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function getCodingAccentVariables(color: string) {
  const rgb = hexToRgb(color) ?? { r: 52, g: 211, b: 153 };
  const accent = rgbToHslTriplet(rgb.r, rgb.g, rgb.b);
  const luminance =
    0.2126 * linearizeChannel(rgb.r) +
    0.7152 * linearizeChannel(rgb.g) +
    0.0722 * linearizeChannel(rgb.b);

  return {
    "--coding-accent": formatHslTriple(accent),
    "--coding-accent-foreground":
      luminance > 0.179 ? "222 24% 7%" : "0 0% 100%",
    "--coding-highlight": formatHslTriple({
      ...accent,
      l: Math.max(accent.l, 62),
    }),
  };
}
