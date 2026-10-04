import { useEffect } from "react";
import { useThemeRootClass } from "../../components/theme-backdrop";
import { DEFAULT_OLED_ACCENT, getOledAccentVariables } from "./accent";

export default function OledTheme({
  accentColor = DEFAULT_OLED_ACCENT,
}: {
  accentColor?: string;
}) {
  useThemeRootClass("oled-theme-active");

  useEffect(() => {
    const root = document.documentElement;
    const vars = getOledAccentVariables(accentColor);
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
    return () => {
      for (const key of Object.keys(vars)) root.style.removeProperty(key);
    };
  }, [accentColor]);

  return null;
}
