import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePersistedStore } from "@/lib/store";
import type { CustomThemeProps, ThemeSettings } from "./types";
import { getActiveThemeConfig } from "./utils";

const CustomTheme = ({ theme }: CustomThemeProps) => {
  const settings = usePersistedStore((s) => s.pluginSettings["themes"]) as
    | ThemeSettings
    | undefined;
  const isEnabled = usePersistedStore(
    (s) => s.enabledPlugins["themes"] ?? false,
  );
  const current: ThemeSettings = settings ?? {
    activeSection: "custom",
    activeTheme: "custom",
    customTheme: {
      lineColor: "#6b7280",
      backgroundSource: "url",
      backgroundUrl: "",
      backgroundData: "",
      backgroundOpacity: 30,
      iconData: "",
    },
    userThemes: [],
  };
  const cfg = getActiveThemeConfig(current, theme);

  const [mounted, setMounted] = useState(false);

  const backgroundStyle = useMemo<CSSProperties>(() => {
    const chosen =
      cfg.backgroundSource === "local" ? cfg.backgroundData : cfg.backgroundUrl;
    if (!chosen) return { display: "none" };
    return {
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundImage: `url(${chosen})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      pointerEvents: "none",
      opacity: (cfg.backgroundOpacity ?? 30) / 100,
      zIndex: 0,
    };
  }, [
    cfg.backgroundSource,
    cfg.backgroundUrl,
    cfg.backgroundData,
    cfg.backgroundOpacity,
  ]);

  useEffect(() => {
    if (!mounted || !isEnabled) return;
    const root = document.documentElement;

    // Apply CSS variables for line color using the --border variable
    const lineHex = cfg.lineColor ?? "#6b7280";
    // Convert hex to HSL for compatibility with hsl(var(--border)) usage
    const toHsl = (hex: string): string => {
      const m = hex.replace("#", "");
      const bigint = parseInt(
        m.length === 3
          ? m
              .split("")
              .map((c) => c + c)
              .join("")
          : m,
        16,
      );
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      const rr = r / 255;
      const gg = g / 255;
      const bb = b / 255;
      const max = Math.max(rr, gg, bb);
      const min = Math.min(rr, gg, bb);
      let h = 0;
      let s = 0;
      const l = (max + min) / 2;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case rr:
            h = (gg - bb) / d + (gg < bb ? 6 : 0);
            break;
          case gg:
            h = (bb - rr) / d + 2;
            break;
          case bb:
            h = (rr - gg) / d + 4;
            break;
        }
        h /= 6;
      }
      const H = Math.round(h * 360);
      const S = Math.round(s * 100);
      const L = Math.round(l * 100);
      return `${H} ${S}% ${L}%`;
    };

    root.style.setProperty("--border", toHsl(lineHex));
    root.style.setProperty("--sidebar-border", toHsl(lineHex));
    root.classList.add("custom-theme-active");
    return () => {
      root.classList.remove("custom-theme-active");
      root.style.removeProperty("--border");
      root.style.removeProperty("--sidebar-border");
    };
  }, [mounted, isEnabled, cfg.lineColor]);

  useEffect(() => setMounted(true), []);

  if (!mounted || !isEnabled) return null;

  const backgroundNode = <div aria-hidden style={backgroundStyle} />;
  return createPortal(backgroundNode, document.body);
};

export default CustomTheme;
