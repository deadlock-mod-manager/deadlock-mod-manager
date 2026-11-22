import { describe, expect, it } from "bun:test";
import type { DeadlockItem } from "@/lib/deadlock-api";
import type { MatchMetadataItem, MatchMetadataStat } from "@/lib/stats/api";
import { inventoryAt, itemTransactions, statAt } from "./match-detail";

const item = (id: number, name: string): DeadlockItem => ({
  id,
  name,
  type: "upgrade",
});

const catalog = new Map([
  [10, item(10, "First")],
  [20, item(20, "Second")],
]);

const entries: MatchMetadataItem[] = [
  { game_time_s: 60, item_id: 10, upgrade_id: 1, sold_time_s: 300 },
  { game_time_s: 120, item_id: 20, upgrade_id: 1, sold_time_s: 0 },
  // Ability upgrades share the metadata list and must never become purchases.
  { game_time_s: 30, item_id: 999, upgrade_id: 2, sold_time_s: 0 },
];

const stat = (time: number, netWorth: number): MatchMetadataStat => ({
  time_stamp_s: time,
  net_worth: netWorth,
  kills: 0,
  deaths: 0,
  assists: 0,
  player_damage: 0,
  player_damage_taken: 0,
  player_healing: 0,
  damage_mitigated: 0,
  boss_damage: 0,
  shots_hit: 0,
  shots_missed: 0,
});

describe("itemTransactions", () => {
  it("turns purchases and sold times into one chronological event stream", () => {
    expect(itemTransactions(entries, catalog)).toMatchObject([
      { kind: "buy", time: 60, item: { id: 10 } },
      { kind: "buy", time: 120, item: { id: 20 } },
      { kind: "sell", time: 300, item: { id: 10 } },
    ]);
  });
});

describe("inventoryAt", () => {
  it("keeps only items owned at the selected match time", () => {
    expect(inventoryAt(entries, catalog, 200).map((entry) => entry.id)).toEqual(
      [10, 20],
    );
    expect(inventoryAt(entries, catalog, 300).map((entry) => entry.id)).toEqual(
      [20],
    );
  });
});

describe("statAt", () => {
  it("holds the latest sampled value at the playhead", () => {
    const stats = [stat(360, 4_500), stat(180, 2_000)];

    expect(statAt(stats, 120)).toBeNull();
    expect(statAt(stats, 300)?.net_worth).toBe(2_000);
    expect(statAt(stats, 500)?.net_worth).toBe(4_500);
  });
});
