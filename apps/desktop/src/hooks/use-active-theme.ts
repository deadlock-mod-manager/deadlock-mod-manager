import { useEffect, useMemo, useState } from "react";
import { usePersistedStore } from "@/lib/store";
import { selectThemeSettings } from "@/lib/store/selectors";
import {
  readSeasonalControls,
  resolveSeason,
  resolveSeasonalTheme,
} from "@/lib/seasonal-themes";
import {
  isRemlockReleaseEnabled,
  resolveActiveTheme,
} from "@/lib/theme-release";
import { useFeatureFlags } from "./use-feature-flags";

export function useRemlockReleaseEnabled() {
  const { data: flags } = useFeatureFlags();
  return isRemlockReleaseEnabled(flags);
}

/** Current local date, refreshed just after midnight so seasons switch without a restart. */
function useToday() {
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const next = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1,
      0,
      0,
      5,
    );
    const timer = setTimeout(
      () => setToday(new Date()),
      next.getTime() - Date.now(),
    );
    return () => clearTimeout(timer);
  }, [today]);
  return today;
}

export function useSeasonalControls() {
  const { data: flags } = useFeatureFlags();
  return useMemo(() => readSeasonalControls(flags), [flags]);
}

export function useSeason() {
  const controls = useSeasonalControls();
  const today = useToday();
  return useMemo(() => resolveSeason(controls, today), [controls, today]);
}

export function useActiveTheme() {
  const settings = usePersistedStore(selectThemeSettings);
  const backgroundEnabled = usePersistedStore(
    (state) => state.enabledPlugins.background ?? false,
  );
  const remlockEnabled = useRemlockReleaseEnabled();
  const season = useSeason();

  return (
    resolveActiveTheme(settings, remlockEnabled, backgroundEnabled) ??
    resolveSeasonalTheme(settings, season, backgroundEnabled)
  );
}
