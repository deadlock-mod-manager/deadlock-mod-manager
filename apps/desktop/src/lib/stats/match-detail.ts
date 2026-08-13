import type { DeadlockItem } from "@/lib/deadlock-api";
import type {
  MatchMetadataItem,
  MatchMetadataPlayer,
  MatchMetadataStat,
} from "@/lib/stats/api";

export type ItemTransaction = {
  id: string;
  item: DeadlockItem;
  kind: "buy" | "sell";
  time: number;
};

/** Metadata also records ability upgrades in `items`; the asset map removes them. */
export const itemTransactions = (
  entries: MatchMetadataItem[],
  itemsById: Map<number, DeadlockItem>,
): ItemTransaction[] =>
  entries
    .flatMap((entry, index) => {
      const item = itemsById.get(entry.item_id);
      if (!item || entry.upgrade_id !== 1) return [];

      const buy: ItemTransaction = {
        id: `${entry.item_id}:buy:${entry.game_time_s}:${index}`,
        item,
        kind: "buy",
        time: entry.game_time_s,
      };
      const sell: ItemTransaction | null =
        entry.sold_time_s > 0
          ? {
              id: `${entry.item_id}:sell:${entry.sold_time_s}:${index}`,
              item,
              kind: "sell",
              time: entry.sold_time_s,
            }
          : null;
      return sell ? [buy, sell] : [buy];
    })
    .sort(
      (a, b) =>
        a.time - b.time || (a.kind === b.kind ? 0 : a.kind === "sell" ? -1 : 1),
    );

export const inventoryAt = (
  entries: MatchMetadataItem[],
  itemsById: Map<number, DeadlockItem>,
  time: number,
): DeadlockItem[] =>
  entries.flatMap((entry) => {
    const item = itemsById.get(entry.item_id);
    const owned =
      item !== undefined &&
      entry.upgrade_id === 1 &&
      entry.game_time_s <= time &&
      (entry.sold_time_s === 0 || entry.sold_time_s > time);
    return owned ? [item] : [];
  });

/** The API samples stats periodically; hold the last known sample while scrubbing. */
export const statAt = (
  stats: MatchMetadataStat[],
  time: number,
): MatchMetadataStat | null => {
  let current: MatchMetadataStat | null = null;
  for (const stat of stats) {
    if (
      stat.time_stamp_s <= time &&
      (current === null || stat.time_stamp_s > current.time_stamp_s)
    ) {
      current = stat;
    }
  }
  return current;
};

export const playerFromMatch = (
  players: MatchMetadataPlayer[],
  accountId: number,
): MatchMetadataPlayer | null =>
  players.find((player) => player.account_id === accountId) ?? null;
