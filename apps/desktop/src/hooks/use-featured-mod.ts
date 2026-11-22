import type { ModDto } from "@deadlock-mods/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { getMod } from "@/lib/api-client";
import { FEATURED_POOL_SIZE, MOD_CATEGORY_ORDER } from "@/lib/constants";
import { modDetailQueryKey } from "@/lib/mods/mod-query-cache";
import { STALE_TIME_API } from "@/lib/query-constants";
import { isModOutdated } from "@/lib/utils";
import type { WithholdNoticeDto } from "@/types/generated/WithholdNoticeDto";
import { isTauriError } from "@/types/tauri";

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

/** A category's eligible mods in this week's order; the first is its pick. */
const featuredCandidates = (mods: ModDto[], now: Date, salt = 0): ModDto[] => {
  const eligible = mods
    .filter(
      (m) =>
        m.downloadable &&
        !m.isNSFW &&
        !m.isObsolete &&
        !isModOutdated(m) &&
        (m.hero || m.images.length > 0 || (m.isAudio && m.audioUrl)),
    )
    .sort((a, b) => b.downloadCount - a.downloadCount)
    .slice(0, FEATURED_POOL_SIZE);

  const { year, week } = getIsoWeekParts(now);
  const seed = year * 100 + week + Math.imul(salt, 0x9e3779b1);
  return deterministicShuffle(eligible, seed);
};

export const pickFeaturedMod = (
  mods: ModDto[],
  now: Date,
  salt = 0,
): ModDto | undefined => featuredCandidates(mods, now, salt)[0];

/**
 * Each category's candidates in `MOD_CATEGORY_ORDER`, leading with its weekly
 * pick. Categories without an eligible mod are skipped.
 */
export const featuredCandidatesByCategory = (
  mods: ModDto[],
  now: Date,
): ModDto[][] =>
  MOD_CATEGORY_ORDER.map((category, index) =>
    featuredCandidates(
      mods.filter((m) => m.category === category),
      now,
      index + 1,
    ),
  ).filter((candidates) => candidates.length > 0);

// GameBanana drops withheld, private and deleted mods from its index, but the
// local catalog can still hold them, and only the submission profile reports a
// withhold. Each pick is confirmed against its profile before it is featured.
const MAX_FEATURED_CHECKS = 3;

/**
 * The first candidate GameBanana still serves publicly. Other failures keep the
 * candidate: the detail fetch already falls back to the cached record offline,
 * so they don't say anything about the mod itself.
 */
export const confirmFeaturedMod = async (
  candidates: ModDto[],
  fetchMod: (
    remoteId: string,
  ) => Promise<{ withheld?: WithholdNoticeDto | null }>,
): Promise<ModDto | undefined> => {
  for (const candidate of candidates.slice(0, MAX_FEATURED_CHECKS)) {
    try {
      const { withheld } = await fetchMod(candidate.remoteId);
      if (!withheld) return candidate;
    } catch (error) {
      if (
        !isTauriError(error) ||
        error.kind !== "providerSubmissionUnavailable"
      )
        return candidate;
    }
  }
  return undefined;
};

/** Leads with `pinned`, replacing the weekly pick for its category. */
export const pinFeaturedMod = (
  featured: ModDto[],
  pinned: ModDto,
): ModDto[] => [
  pinned,
  ...featured.filter(
    (m) => m.remoteId !== pinned.remoteId && m.category !== pinned.category,
  ),
];

/**
 * Picks the "featured mods of the week" deterministically, one per category,
 * from each category's top downloads. Stable across reloads, identical for
 * every user, rotates weekly. A pick GameBanana no longer serves publicly gives
 * way to the category's next candidate. A `pinned` mod leads the week instead
 * of its category's pick.
 *
 * NOTE: client-side heuristic. A backend `/featured` endpoint would be a
 * better long-term solution.
 */
export const useFeaturedMods = (
  mods: ModDto[] | undefined,
  options?: { now?: Date; pinned?: ModDto },
) => {
  const queryClient = useQueryClient();
  const pinned = options?.pinned;
  const now = options?.now;
  const candidates = useMemo(
    () => (mods ? featuredCandidatesByCategory(mods, now ?? new Date()) : []),
    [mods, now],
  );
  const confirmed = useQuery({
    queryKey: [
      "featured-mods",
      candidates.map((category) =>
        category.slice(0, MAX_FEATURED_CHECKS).map((m) => m.remoteId),
      ),
    ],
    queryFn: async () => {
      const picks = await Promise.all(
        candidates.map((category) =>
          confirmFeaturedMod(category, (remoteId) =>
            queryClient.fetchQuery({
              queryKey: modDetailQueryKey(remoteId),
              queryFn: () => getMod(remoteId),
              staleTime: STALE_TIME_API,
            }),
          ),
        ),
      );
      return picks.filter((pick) => pick !== undefined);
    },
    staleTime: STALE_TIME_API,
  });
  const featured = useMemo(() => {
    const picks = confirmed.data ?? [];
    return pinned ? pinFeaturedMod(picks, pinned) : picks;
  }, [confirmed.data, pinned]);
  return { featured, isPending: confirmed.isPending };
};
