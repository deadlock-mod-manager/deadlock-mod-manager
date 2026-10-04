import type { FeatureFlag } from "@deadlock-mods/shared";
import type { ThemeSettings } from "@/plugins/themes/custom/types";

export function isRemlockReleaseEnabled(flags: readonly FeatureFlag[] = []) {
  const release = flags.find((flag) => flag.name === "remlock-release");
  const themes = flags.find((flag) => flag.name === "plugin-themes");
  return (
    release?.type === "boolean" &&
    release.value === true &&
    themes?.value !== false
  );
}

export function resolveActiveTheme(
  settings: ThemeSettings | undefined,
  remlockEnabled: boolean,
  backgroundEnabled = false,
): string | undefined {
  if (settings?.activeTheme) {
    return settings.activeTheme === "remlock" && !remlockEnabled
      ? undefined
      : settings.activeTheme;
  }

  return remlockEnabled &&
    !backgroundEnabled &&
    !settings?.releaseThemeDismissed
    ? "remlock"
    : undefined;
}
