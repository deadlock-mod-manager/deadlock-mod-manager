import type { ModDto } from "@deadlock-mods/shared";
import { isModOutdated } from "@/lib/utils";

export type AlbumFreshness = {
  status: "current" | "partial" | "outdated";
  outdated: number;
  total: number;
};

/**
 * How many of an album's mods predate the current game patch, by the same
 * rule the mod store uses. Derived from catalog data on every render, so an
 * author's update clears it once the catalog syncs. Null when the catalog
 * knows none of the album's mods, since there is nothing to judge.
 */
export const getAlbumFreshness = (mods: ModDto[]): AlbumFreshness | null => {
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
