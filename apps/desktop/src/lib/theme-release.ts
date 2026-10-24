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

const DEFAULT_REMLOCK_MOD_ID = "687789";

/**
 * GameBanana id pinned as mod of the week, while the release is on and
 * `remlock-featured-until` is still ahead. The id comes from
 * `remlock-featured-mod-id`, falling back to the Remlock mod.
 */
export function getRemlockFeaturedModId(
  flags: readonly FeatureFlag[] = [],
  now = new Date(),
): string | undefined {
  if (!isRemlockReleaseEnabled(flags)) return undefined;
  const flag = (name: string) =>
    z
      .string()
      .catch("")
      .parse(flags.find((f) => f.name === name)?.value)
      .trim();
  const end = Date.parse(flag("remlock-featured-until"));
  if (Number.isNaN(end) || now.getTime() >= end) return undefined;
  return flag("remlock-featured-mod-id") || DEFAULT_REMLOCK_MOD_ID;
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
