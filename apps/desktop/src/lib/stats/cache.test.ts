import { beforeEach, expect, it, mock } from "bun:test";
import { matchOutcome, summarize } from "@/lib/stats/derive";
import {
  type MatchHistoryEntry,
  matchHistoryEntrySchema,
} from "@/lib/validation/stats-api";

type StoredHistory = {
  version: number;
  fetchedAt: number;
  data: MatchHistoryEntry[];
};

const entries = new Map<string, StoredHistory>();
mock.module("@tauri-apps/plugin-store", () => ({
  load: async () => ({
    entries: async () => [...entries.entries()],
    get: async (key: string) => entries.get(key),
    set: async (key: string, value: StoredHistory) => entries.set(key, value),
    delete: async (key: string) => entries.delete(key),
    keys: async () => [...entries.keys()],
  }),
}));
mock.module("@/lib/runtime-bootstrap", () => ({
  resolveStorePath: async (file: string) => file,
}));
mock.module("@/lib/logger", () => ({
  createLogger: () => ({
    withError: () => ({
      warn: () => {},
      withMetadata: () => ({ warn: () => {} }),
    }),
  }),
}));

const { cachedFetch, STATS_TTL } = await import("./cache");
const key = "player:match-history:1";
const oldMatch = matchHistoryEntrySchema.parse({
  account_id: 1,
  match_id: 133901798,
  hero_id: 13,
  start_time: 1_700_000_000,
  player_team: 0,
  match_result: 1,
});
const unscored = { ...oldMatch, player_match_outcome: 5 };

beforeEach(() => entries.clear());

it("refetches a fresh pre-upgrade history instead of showing a false loss", async () => {
  entries.set(key, { version: 2, fetchedAt: Date.now(), data: [oldMatch] });
  const fetcher = mock(async () => [unscored]);

  const result = await cachedFetch(key, STATS_TTL.matchHistory, fetcher);

  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(matchOutcome(result.data[0] ?? oldMatch)).toBe("notScored");
  expect(summarize(result.data).losses).toBe(0);
  expect(entries.get(key)?.version).toBe(3);

  await cachedFetch(key, STATS_TTL.matchHistory, fetcher);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("reuses fresh current-version stats without an extra request", async () => {
  entries.set(key, { version: 3, fetchedAt: Date.now(), data: [unscored] });
  const fetcher = mock(async () => [oldMatch]);

  const result = await cachedFetch(key, STATS_TTL.matchHistory, fetcher);

  expect(result.data).toEqual([unscored]);
  expect(fetcher).not.toHaveBeenCalled();
});

it("does not fall back to incompatible old stats when offline", async () => {
  entries.set(key, { version: 2, fetchedAt: Date.now(), data: [oldMatch] });
  const error = new Error("Offline");

  await expect(
    cachedFetch<MatchHistoryEntry[]>(key, STATS_TTL.matchHistory, async () => {
      throw error;
    }),
  ).rejects.toBe(error);
});

it("preserves the offline fallback for current-version stats", async () => {
  entries.set(key, {
    version: 3,
    fetchedAt: Date.now() - STATS_TTL.matchHistory - 1,
    data: [unscored],
  });

  const result = await cachedFetch<MatchHistoryEntry[]>(
    key,
    STATS_TTL.matchHistory,
    async () => {
      throw new Error("Offline");
    },
  );

  expect(result.data).toEqual([unscored]);
  expect(result.isStale).toBe(true);
});
