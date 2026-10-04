import { usePersistedStore } from "@/lib/store";
import { selectThemeSettings } from "@/lib/store/selectors";
import {
  isRemlockReleaseEnabled,
  resolveActiveTheme,
} from "@/lib/theme-release";
import { useFeatureFlags } from "./use-feature-flags";

export function useRemlockReleaseEnabled() {
  const { data: flags } = useFeatureFlags();
  return isRemlockReleaseEnabled(flags);
}

export function useActiveTheme() {
  const settings = usePersistedStore(selectThemeSettings);
  const backgroundEnabled = usePersistedStore(
    (state) => state.enabledPlugins.background ?? false,
  );
  const remlockEnabled = useRemlockReleaseEnabled();
  return resolveActiveTheme(settings, remlockEnabled, backgroundEnabled);
}
