import type { ModDto } from "@deadlock-mods/shared";
import { useMemo } from "react";
import { isModOutdated } from "@/lib/utils";

const FEATURED_POOL_SIZE = 50;

export type IsoWeekParts = { year: number; week: number };

export const getIsoWeekParts = (date: Date): IsoWeekParts => {
  const tmp = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const year = tmp.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(
    ((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return { year, week };
};

const deterministicShuffle = <T>(
  items: ReadonlyArray<T>,
  seed: number,
): T[] => {
  const arr = [...items];
  let state = seed >>> 0;
  if (state === 0) {
    state = 0x9e3779b9;
  }
  for (let i = arr.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const u01 = state / 4294967296;
    const j = Math.floor(u01 * (i + 1));
    const slot = arr[i];
    const swap = arr[j];
    arr[i] = swap;
    arr[j] = slot;
  }
  return arr;
};

export const pickFeaturedMod = (
  mods: ModDto[],
  now: Date,
): ModDto | undefined => {
  if (mods.length === 0) return undefined;

  const eligible = mods
    .filter(
      (m) =>
        m.downloadable &&
        !m.isNSFW &&
        !m.isObsolete &&
        !isModOutdated(m) &&
        (m.hero || m.images.length > 0),
    )
    .sort((a, b) => b.downloadCount - a.downloadCount)
    .slice(0, FEATURED_POOL_SIZE);

  if (eligible.length === 0) return undefined;

  const { year, week } = getIsoWeekParts(now);
  const seed = year * 100 + week;
  const shuffled = deterministicShuffle(eligible, seed);
  const picked = shuffled[0];
  return picked;
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
    return pickFeaturedMod(mods, options?.now ?? new Date());
  }, [mods, options?.now]);
};
