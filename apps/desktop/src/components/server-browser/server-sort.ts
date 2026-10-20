import type { ServerBrowserEntry } from "@deadlock-mods/shared";

export type ServerSortKey = "name" | "players" | "map" | "ping" | "region";
type SortDirection = "asc" | "desc";
export type ServerSort = { key: ServerSortKey; direction: SortDirection };

/** The direction a column starts in: busiest and closest servers first. */
const DEFAULT_DIRECTION = {
  name: "asc",
  players: "desc",
  map: "asc",
  ping: "asc",
  region: "asc",
} as const satisfies Record<ServerSortKey, SortDirection>;

type Pings = Partial<Record<string, number | null>>;

const numberValue = (
  server: ServerBrowserEntry,
  key: "players" | "ping",
  pings: Pings,
): number | null =>
  key === "players" ? server.player_count : (pings[server.id] ?? null);

const textValue = (
  server: ServerBrowserEntry,
  key: "name" | "map" | "region",
): string | null => {
  switch (key) {
    case "name":
      return server.name;
    case "map":
      return server.map || null;
    case "region":
      return server.source_region ?? null;
    default: {
      const exhaustive: never = key;
      return exhaustive;
    }
  }
};

/** Missing values sort after present ones, whatever the direction. */
const compareNullable = <T>(
  left: T | null,
  right: T | null,
  compare: (a: T, b: T) => number,
  sign: number,
): number => {
  if (left === null || right === null) {
    if (left === right) return 0;
    return left === null ? 1 : -1;
  }
  return compare(left, right) * sign;
};

const compareText = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/**
 * Servers without a value (no ping reply, unknown region) stay at the bottom
 * in both directions. Ties keep the API's order.
 */
export const sortServers = (
  servers: ServerBrowserEntry[],
  sort: ServerSort | null,
  pings: Pings,
): ServerBrowserEntry[] => {
  if (!sort) return servers;
  const sign = sort.direction === "asc" ? 1 : -1;
  const { key } = sort;
  return [...servers].sort((a, b) =>
    key === "players" || key === "ping"
      ? compareNullable(
          numberValue(a, key, pings),
          numberValue(b, key, pings),
          (x, y) => x - y,
          sign,
        )
      : compareNullable(
          textValue(a, key),
          textValue(b, key),
          compareText,
          sign,
        ),
  );
};

/** Click cycle: default direction, flipped, then back to the API's order. */
export const nextSort = (
  current: ServerSort | null,
  key: ServerSortKey,
): ServerSort | null => {
  if (current?.key !== key) {
    return { key, direction: DEFAULT_DIRECTION[key] };
  }
  if (current.direction === DEFAULT_DIRECTION[key]) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return null;
};
