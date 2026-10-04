import { type ReactNode, createContext, useContext, useMemo } from "react";
import { useActiveTheme } from "@/hooks/use-active-theme";
import { overrides as deadlockApiOverrides } from "@/plugins/themes/pre-defined/deadlock-api/overrides";
import { overrides as remlockOverrides } from "@/plugins/themes/pre-defined/remlock/overrides";
import { overrides as teaOverrides } from "@/plugins/themes/pre-defined/tea/overrides";
import type { ThemeOverrides } from "@/types/theme-overrides";

export type { ThemeOverrides };

const EMPTY_OVERRIDES: ThemeOverrides = {};

const ThemeOverridesContext = createContext<ThemeOverrides>(EMPTY_OVERRIDES);

const THEME_OVERRIDES_REGISTRY = new Map<string, ThemeOverrides>([
  ["deadlock-api", deadlockApiOverrides],
  ["tea", teaOverrides],
  ["remlock", remlockOverrides],
]);

export function ThemeOverridesProvider({ children }: { children: ReactNode }) {
  const activeTheme = useActiveTheme();

  const overrides = useMemo(
    () =>
      activeTheme
        ? (THEME_OVERRIDES_REGISTRY.get(activeTheme) ?? EMPTY_OVERRIDES)
        : EMPTY_OVERRIDES,
    [activeTheme],
  );

  return (
    <ThemeOverridesContext.Provider value={overrides}>
      {children}
    </ThemeOverridesContext.Provider>
  );
}

export function useThemeOverride<K extends keyof ThemeOverrides>(
  slot: K,
): ThemeOverrides[K] | undefined {
  const overrides = useContext(ThemeOverridesContext);
  return overrides[slot];
}
