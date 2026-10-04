import { useMemo } from "react";
import {
  ThemeBackdrop,
  useThemeStyleVars,
} from "../../components/theme-backdrop";
import { hexToRgb, rgbToHslTriplet } from "../../custom/theme-color-utils";

// DEFAULT_ARCANE_ACCENT (#E8416F) as RGB, used when a saved color is unparsable.
const DEFAULT_ARCANE_RGB = { r: 232, g: 65, b: 111 };

type ArcaneThemeProps = {
  accentColor?: string;
};

const ArcaneTheme = ({ accentColor }: ArcaneThemeProps) => {
  const { r, g, b } = useMemo(
    () => hexToRgb(accentColor ?? "") ?? DEFAULT_ARCANE_RGB,
    [accentColor],
  );
  const { h, s, l } = useMemo(() => rgbToHslTriplet(r, g, b), [r, g, b]);

  const backdropStyle = useMemo(() => {
    const darkerR = Math.round(r * 0.85);
    const darkerG = Math.round(g * 0.85);
    const darkerB = Math.round(b * 0.85);
    return {
      background: `
        radial-gradient(ellipse 85% 65% at 0% 0%, rgba(${r}, ${g}, ${b}, 0.26) 0%, transparent 52%),
        radial-gradient(ellipse 80% 60% at 100% 100%, rgba(${r}, ${g}, ${b}, 0.21) 0%, transparent 48%),
        radial-gradient(ellipse 55% 45% at 100% 0%, rgba(${darkerR}, ${darkerG}, ${darkerB}, 0.11) 0%, transparent 42%),
        radial-gradient(ellipse 65% 50% at 0% 100%, rgba(${darkerR}, ${darkerG}, ${darkerB}, 0.09) 0%, transparent 38%),
        radial-gradient(ellipse 50% 50% at 50% 50%, rgba(${r}, ${g}, ${b}, 0.04) 0%, transparent 65%),
        hsl(var(--background))
      `,
    };
  }, [r, g, b]);

  const cssVars = useMemo(() => {
    const primaryL = Math.min(l, 48);
    const accentL = Math.max(primaryL - 10, 38);
    const ringL = Math.min(l, 45);
    const subtleS = Math.min(s, 15);
    const borderS = Math.min(s, 30);
    return `
      .arcane-theme-active {
        --primary: ${h} ${Math.min(s, 70)}% ${primaryL}%;
        --primary-foreground: 0 0% 4%;
        --accent: ${h} ${Math.min(s - 20, 50)}% ${accentL}%;
        --accent-foreground: 0 0% 4%;
        --ring: ${h} ${Math.min(s - 5, 65)}% ${ringL}%;
        --card: ${h} ${subtleS}% 6% / 0.9;
        --popover: ${h} ${subtleS}% 6% / 0.95;
        --secondary: ${h} ${borderS}% 10% / 0.85;
        --muted: ${h} ${borderS}% 12% / 0.85;
        --border: ${h} ${borderS}% 16%;
        --input: ${h} ${borderS}% 14% / 0.7;
        --sidebar-primary: ${h} ${Math.min(s, 70)}% ${primaryL}%;
        --sidebar-primary-foreground: 0 0% 4%;
        --sidebar-accent: ${h} ${Math.min(s - 20, 50)}% ${accentL}%;
        --sidebar-accent-foreground: 0 0% 4%;
        --sidebar-border: ${h} ${borderS}% 14%;
      }
    `;
  }, [h, s, l]);

  useThemeStyleVars("arcane-dynamic-vars", cssVars);

  return (
    <ThemeBackdrop rootClass='arcane-theme-active' style={backdropStyle} />
  );
};

export default ArcaneTheme;
