import type { ModDto } from "@deadlock-mods/shared";
import { useMemo } from "react";

const FEATURED_POOL_SIZE = 50;

const getIsoWeekNumber = (date: Date): number => {
  // ISO week number: deterministic across users for "Mod of the Week"
  const tmp = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

/**
 * Picks a "featured mod of the week" deterministically from the pool of top
 * downloads. Stable across reloads, identical for every user, rotates weekly.
 *
 * NOTE: client-side heuristic. A backend `/featured` endpoint would be a
 * better long-term solution.
 */
export const useFeaturedMod = (
  mods: ModDto[] | undefined,
  options?: { now?: Date },
): ModDto | undefined => {
  return useMemo(() => {
    if (!mods || mods.length === 0) return undefined;

    const eligible = mods
      .filter((m) => m.downloadable && (m.hero || m.images.length > 0))
      .sort((a, b) => b.downloadCount - a.downloadCount)
      .slice(0, FEATURED_POOL_SIZE);

    if (eligible.length === 0) return undefined;

    const week = getIsoWeekNumber(options?.now ?? new Date());
    return eligible[week % eligible.length];
  }, [mods, options?.now]);
};
