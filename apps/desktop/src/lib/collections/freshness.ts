import type { ModDto } from "@deadlock-mods/shared";
import { isModOutdated } from "@/lib/utils";

export type CollectionFreshness = {
  status: "current" | "partial" | "outdated";
  outdated: number;
  total: number;
};

/**
 * How many of an collection's mods predate the current game patch, by the same
 * rule the mod store uses. Null when the catalog knows none of the collection's
 * mods, since there is nothing to judge.
 */
export const getCollectionFreshness = (
  mods: ModDto[],
): CollectionFreshness | null => {
  if (mods.length === 0) return null;
  const outdated = mods.filter(isModOutdated).length;
  const status =
    outdated === 0
      ? "current"
      : outdated === mods.length
        ? "outdated"
        : "partial";
  return { status, outdated, total: mods.length };
};
