import type { FeatureFlag } from "@deadlock-mods/shared";
import { z } from "zod";
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

export function readStringFlag(
  flags: readonly FeatureFlag[],
  name: string,
): string {
  return z
    .union([z.string(), z.number()])
    .transform(String)
    .catch("")
    .parse(flags.find((f) => f.name === name)?.value)
    .trim();
}

const DEFAULT_REMLOCK_MOD_ID = "687789";

export function getRemlockFeaturedModId(
  flags: readonly FeatureFlag[] = [],
  now = new Date(),
): string | undefined {
  if (!isRemlockReleaseEnabled(flags)) return undefined;
  const end = Date.parse(readStringFlag(flags, "remlock-featured-until"));
  if (Number.isNaN(end) || now.getTime() >= end) return undefined;
  return (
    readStringFlag(flags, "remlock-featured-mod-id") || DEFAULT_REMLOCK_MOD_ID
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
