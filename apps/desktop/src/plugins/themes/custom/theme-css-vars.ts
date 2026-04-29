import {
  darkenAccentFromPrimary,
  formatHslTriple,
  hexToHslTripleString,
  hexToRgb,
  hslCssTripleWithOpacity,
  hslTripletFromHex,
  ringFromPrimary,
} from "./theme-color-utils";
import type { CustomThemePalette } from "./types";

const PRIMARY_FG = "20 9% 6%";
const SIDEBAR_PRIMARY_FG = "0 0% 9%";
const SIDEBAR_ACCENT_FG = "15 10% 16%";

export function buildFullCustomThemeCssVariables(
  palette: CustomThemePalette,
): Record<string, string> {
  const primaryTriplet = hslTripletFromHex(palette.accentColor);
  const accentTriplet = darkenAccentFromPrimary(primaryTriplet);
  const ringTriplet = ringFromPrimary(primaryTriplet);
  const borderHsl = hexToHslTripleString(palette.lineColor);
  const sidebarBgTriple = hexToHslTripleString(palette.popoverColor);

  return {
    "--radius": `${palette.cornerRadiusPx}px`,
    "--border": borderHsl,
    "--sidebar-border": borderHsl,
    "--primary": formatHslTriple(primaryTriplet),
    "--sidebar-primary": formatHslTriple(primaryTriplet),
    "--primary-foreground": PRIMARY_FG,
    "--sidebar-primary-foreground": SIDEBAR_PRIMARY_FG,
    "--accent": formatHslTriple(accentTriplet),
    "--accent-foreground": PRIMARY_FG,
    "--sidebar-accent": formatHslTriple(primaryTriplet),
    "--sidebar-accent-foreground": SIDEBAR_ACCENT_FG,
    "--ring": formatHslTriple(ringTriplet),
    "--card": hexToHslTripleString(palette.cardColor),
    "--popover": hexToHslTripleString(palette.popoverColor),
    "--secondary": hexToHslTripleString(palette.secondaryColor),
    "--muted": hexToHslTripleString(palette.mutedColor),
    "--foreground": hexToHslTripleString(palette.foregroundColor),
    "--muted-foreground": hexToHslTripleString(palette.mutedForegroundColor),
    "--card-foreground": hexToHslTripleString(palette.foregroundColor),
    "--popover-foreground": hexToHslTripleString(palette.foregroundColor),
    "--secondary-foreground": hexToHslTripleString(palette.foregroundColor),
    "--sidebar-foreground": hexToHslTripleString(palette.foregroundColor),
    "--background": hexToHslTripleString(palette.popoverColor),
    "--sidebar-background": hslCssTripleWithOpacity(
      sidebarBgTriple,
      100 - Math.min(100, Math.max(0, palette.sidebarOpacity)),
    ),
    "--input": borderHsl,
  };
}

import type { CSSProperties } from "react";

export function buildAmbientBackgroundStyle(
  palette: CustomThemePalette,
): CSSProperties | null {
  if (!palette.ambientBackgroundEnabled) {
    return null;
  }
  const rgb = hexToRgb(palette.ambientAccentColor);
  if (rgb === null) {
    return null;
  }
  const { r, g, b } = rgb;
  const darkerR = Math.round(r * 0.85);
  const darkerG = Math.round(g * 0.85);
  const darkerB = Math.round(b * 0.85);
  const intensityRatio = palette.ambientIntensity / 14;
  const spreadAdj = palette.ambientSpread / 4;
  const alphaMain = Math.min(0.38, 0.26 * intensityRatio);
  const alphaCorner = Math.min(0.32, 0.21 * intensityRatio);
  const alphaMinorA = Math.min(0.18, 0.11 * intensityRatio * spreadAdj);
  const alphaMinorB = Math.min(0.14, 0.09 * intensityRatio * spreadAdj);
  const alphaWash = Math.min(0.08, 0.04 * intensityRatio);

  return {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    pointerEvents: "none",
    zIndex: 0,
    background: `
      radial-gradient(ellipse 85% 65% at 0% 0%, rgba(${r}, ${g}, ${b}, ${alphaMain}) 0%, transparent 52%),
      radial-gradient(ellipse 80% 60% at 100% 100%, rgba(${r}, ${g}, ${b}, ${alphaCorner}) 0%, transparent 48%),
      radial-gradient(ellipse 55% 45% at 100% 0%, rgba(${darkerR}, ${darkerG}, ${darkerB}, ${alphaMinorA}) 0%, transparent 42%),
      radial-gradient(ellipse 65% 50% at 0% 100%, rgba(${darkerR}, ${darkerG}, ${darkerB}, ${alphaMinorB}) 0%, transparent 38%),
      radial-gradient(ellipse 50% 50% at 50% 50%, rgba(${r}, ${g}, ${b}, ${alphaWash}) 0%, transparent 65%)
    `,
  };
}
