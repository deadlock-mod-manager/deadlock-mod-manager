import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePersistedStore } from "@/lib/store";
import type { CustomThemeProps, ThemeSettings } from "./types";
import {
  buildAmbientBackgroundStyle,
  buildFullCustomThemeCssVariables,
} from "./theme-css-vars";
import { getActiveThemeConfig } from "./utils";

const CustomTheme = ({ theme }: CustomThemeProps) => {
  const themeSlice = usePersistedStore((s) => s.pluginSettings.themes) as
    | ThemeSettings
    | undefined;
  const isEnabled = usePersistedStore((s) => s.enabledPlugins.themes ?? false);

  const palette = useMemo(
    () => getActiveThemeConfig(themeSlice, theme),
    [themeSlice, theme],
  );

  const ambientStyle = useMemo(
    () => buildAmbientBackgroundStyle(palette),
    [palette],
  );

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !isEnabled) return;
    const root = document.documentElement;
    const vars = buildFullCustomThemeCssVariables(palette);

    for (const key of Object.keys(vars)) {
      root.style.setProperty(key, vars[key]);
    }
    root.classList.add("custom-theme-active");

    return () => {
      root.classList.remove("custom-theme-active");
      for (const key of Object.keys(vars)) {
        root.style.removeProperty(key);
      }
    };
  }, [mounted, isEnabled, palette]);

  if (!mounted) return null;

  if (ambientStyle === null) return null;

  return createPortal(<div aria-hidden style={ambientStyle} />, document.body);
};

export default CustomTheme;
