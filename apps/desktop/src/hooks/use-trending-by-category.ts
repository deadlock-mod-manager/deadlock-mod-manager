import type { ModDto } from "@deadlock-mods/shared";
import { useMemo } from "react";
import {
  MOD_CATEGORY_ORDER,
  ModCategory,
  TRENDING_LIMIT,
  TRENDING_WINDOW_DAYS,
} from "@/lib/constants";

const MIN_RECENT_BEFORE_FALLBACK = 4;

export type TrendingByCategory = Record<string, ModDto[]>;

export const useTrendingByCategory = (
  mods: ModDto[] | undefined,
  options?: { now?: Date; limit?: number },
): TrendingByCategory => {
  return useMemo(() => {
    if (!mods || mods.length === 0) return {};

    const limit = options?.limit ?? TRENDING_LIMIT;
    const now = options?.now ?? new Date();
    const cutoff = now.getTime() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const predefined = new Set<string>(Object.values(ModCategory));

    const buckets: TrendingByCategory = {};
    for (const category of MOD_CATEGORY_ORDER) {
      buckets[category] = [];
    }

    const grouped = new Map<string, ModDto[]>();
    for (const mod of mods) {
      if (!mod.downloadable) continue;
      const key = predefined.has(mod.category)
        ? mod.category
        : ModCategory.OTHER_MISC;
      const list = grouped.get(key);
      if (list) {
        list.push(mod);
      } else {
        grouped.set(key, [mod]);
      }
    }

    for (const [category, list] of grouped) {
      const sorted = [...list].sort(
        (a, b) => b.downloadCount - a.downloadCount,
      );
      const recent = sorted.filter(
        (m) => new Date(m.remoteUpdatedAt).getTime() >= cutoff,
      );
      const picks =
        recent.length >= MIN_RECENT_BEFORE_FALLBACK ? recent : sorted;
      buckets[category] = picks.slice(0, limit);
    }

    return buckets;
  }, [mods, options?.now, options?.limit]);
};
