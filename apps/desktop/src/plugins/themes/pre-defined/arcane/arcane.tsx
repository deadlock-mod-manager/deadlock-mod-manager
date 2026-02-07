import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const DEFAULT_ACCENT = "#E8416F";

const hexToRgb = (hexStr: string) => {
  const m = hexStr.replace("#", "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  const bigint = parseInt(full, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
};

const rgbToHsl = (r: number, g: number, b: number) => {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rN:
        h = ((gN - bN) / d + (gN < bN ? 6 : 0)) / 6;
        break;
      case gN:
        h = ((bN - rN) / d + 2) / 6;
        break;
      default:
        h = ((rN - gN) / d + 4) / 6;
    }
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
};

type ArcaneThemeProps = {
  accentColor?: string;
};

const ArcaneTheme = ({ accentColor }: ArcaneThemeProps) => {
  const [mounted, setMounted] = useState(false);
  const color = accentColor || DEFAULT_ACCENT;

  const { r, g, b } = useMemo(() => hexToRgb(color), [color]);
  const { h, s, l } = useMemo(() => rgbToHsl(r, g, b), [r, g, b]);

  const backgroundStyle = useMemo<CSSProperties>(() => {
    const darkerR = Math.round(r * 0.85);
    const darkerG = Math.round(g * 0.85);
    const darkerB = Math.round(b * 0.85);
    return {
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      background: `
        radial-gradient(ellipse 85% 65% at 0% 0%, rgba(${r}, ${g}, ${b}, 0.26) 0%, transparent 52%),
        radial-gradient(ellipse 80% 60% at 100% 100%, rgba(${r}, ${g}, ${b}, 0.21) 0%, transparent 48%),
        radial-gradient(ellipse 55% 45% at 100% 0%, rgba(${darkerR}, ${darkerG}, ${darkerB}, 0.11) 0%, transparent 42%),
        radial-gradient(ellipse 65% 50% at 0% 100%, rgba(${darkerR}, ${darkerG}, ${darkerB}, 0.09) 0%, transparent 38%),
        radial-gradient(ellipse 50% 50% at 50% 50%, rgba(${r}, ${g}, ${b}, 0.04) 0%, transparent 65%)
      `,
      pointerEvents: "none",
      zIndex: 0,
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

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.classList.add("arcane-theme-active");

    const styleId = "arcane-dynamic-vars";
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = cssVars;

    return () => {
      root.classList.remove("arcane-theme-active");
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, [mounted, cssVars]);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const backgroundNode = <div aria-hidden style={backgroundStyle} />;
  return createPortal(backgroundNode, document.body);
};

export default ArcaneTheme;
