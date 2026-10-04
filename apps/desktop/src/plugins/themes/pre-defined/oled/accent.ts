import {
  formatHslTriple,
  hexToRgb,
  rgbToHslTriplet,
} from "../../custom/theme-color-utils";

export const DEFAULT_OLED_ACCENT = "#D8C497";

export const OLED_ACCENT_PRESETS = [
  DEFAULT_OLED_ACCENT,
  "#E5E5E5",
  "#F2A7B8",
  "#B9A6F5",
  "#8EC5FC",
  "#7EE0B5",
  "#F5B65C",
  "#E5484D",
] as const;

function linearizeChannel(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function getOledAccentVariables(color: string) {
  const rgb = hexToRgb(color) ?? { r: 216, g: 196, b: 151 };
  const accent = rgbToHslTriplet(rgb.r, rgb.g, rgb.b);
  const luminance =
    0.2126 * linearizeChannel(rgb.r) +
    0.7152 * linearizeChannel(rgb.g) +
    0.0722 * linearizeChannel(rgb.b);

  return {
    "--oled-accent": formatHslTriple(accent),
    "--oled-accent-foreground": luminance > 0.179 ? "0 0% 0%" : "0 0% 100%",
    "--oled-highlight": formatHslTriple({
      ...accent,
      l: Math.max(accent.l, 65),
    }),
  };
}
