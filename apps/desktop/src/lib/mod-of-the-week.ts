import type { FeatureFlag } from "@deadlock-mods/shared";
import { getRemlockFeaturedModId, readStringFlag } from "@/lib/theme-release";

/**
 * GameBanana id pinned as mod of the week. A pin set with the bot's
 * `/modoftheweek` command (`mod-of-the-week-id` until `mod-of-the-week-until`)
 * wins over the Remlock release pin.
 */
export function getPinnedFeaturedModId(
  flags: readonly FeatureFlag[] = [],
  now = new Date(),
): string | undefined {
  const id = readStringFlag(flags, "mod-of-the-week-id");
  const end = Date.parse(readStringFlag(flags, "mod-of-the-week-until"));
  if (id && !Number.isNaN(end) && now.getTime() < end) return id;
  return getRemlockFeaturedModId(flags, now);
}
