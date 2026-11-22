import type { FeatureFlag } from "@deadlock-mods/shared";
import { getRemlockFeaturedModId, readStringFlag } from "@/lib/theme-release";

export function getPinnedFeaturedModId(
  flags: readonly FeatureFlag[] = [],
  now = new Date(),
): string | undefined {
  const id = readStringFlag(flags, "mod-of-the-week-id");
  const end = Date.parse(readStringFlag(flags, "mod-of-the-week-until"));
  if (id && !Number.isNaN(end) && now.getTime() < end) return id;
  return getRemlockFeaturedModId(flags, now);
}
