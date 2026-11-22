import type { ServerPickerLatency } from "@/types/generated/ServerPickerLatency";
import type { ServerPickerLocation } from "@/types/generated/ServerPickerLocation";
import type { ServerPickerState } from "@/types/generated/ServerPickerState";
import type { RegionHistoryEntry } from "@/lib/stats/api";

export type ServerPickerSort = "name" | "latency";

export const pickerPingTone = (ping: number | null | undefined): string =>
  ping == null
    ? "text-muted-foreground"
    : ping < 60
      ? "text-signal-good"
      : ping < 120
        ? "text-signal-fair"
        : "text-signal-poor";

export const pickerRoutingStatus = (
  state?: Pick<
    ServerPickerState,
    "observationKnown" | "hasRestrictions" | "observedBlockedLocations"
  >,
): string => {
  if (!state?.observationKnown) return "serverPicker.unverified";
  if (state.observedBlockedLocations.length > 0)
    return "serverPicker.activeBlocks";
  return state.hasRestrictions
    ? "serverPicker.partialRestrictions"
    : "serverPicker.defaultRouting";
};

export const PICKER_REGION_KEYS = new Map([
  ["northAmerica", "serverPicker.regions.northAmerica"],
  ["southAmerica", "serverPicker.regions.southAmerica"],
  ["europe", "serverPicker.regions.europe"],
  ["asia", "serverPicker.regions.asia"],
  ["oceania", "serverPicker.regions.oceania"],
  ["africa", "serverPicker.regions.africa"],
  ["middleEast", "serverPicker.regions.middleEast"],
  ["other", "serverPicker.regions.other"],
]);

export const changeBlockedLocations = (
  current: readonly string[],
  locationIds: readonly string[],
  blocked: boolean,
): string[] => {
  const result = new Set(current);
  for (const id of locationIds) {
    if (blocked) result.add(id);
    else result.delete(id);
  }
  return [...result].sort();
};

export const countPickerChanges = (
  current: readonly string[],
  draft: readonly string[],
): number => {
  const baseline = new Set(current);
  const selection = new Set(draft);
  return [...new Set([...baseline, ...selection])].filter(
    (id) => baseline.has(id) !== selection.has(id),
  ).length;
};

export const groupPickerLocations = (
  locations: readonly ServerPickerLocation[],
  search: string,
  region: string,
  sort: ServerPickerSort,
  latencies: readonly ServerPickerLatency[],
): { region: string; locations: ServerPickerLocation[] }[] => {
  const query = search.trim().toLocaleLowerCase();
  const timings = new Map(
    latencies.map((latency) => [latency.locationId, latency.latencyMs]),
  );
  const groups = new Map<string, ServerPickerLocation[]>();
  for (const location of locations) {
    if (region !== "all" && location.region !== region) continue;
    if (
      query &&
      !`${location.name} ${location.id} ${location.countryCode ?? ""}`
        .toLocaleLowerCase()
        .includes(query)
    )
      continue;
    const group = groups.get(location.region) ?? [];
    group.push(location);
    groups.set(location.region, group);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => {
      if (sort === "latency") {
        const a = timings.get(left.id) ?? Number.POSITIVE_INFINITY;
        const b = timings.get(right.id) ?? Number.POSITIVE_INFINITY;
        if (a !== b) return a - b;
      }
      return (
        left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
      );
    });
  }
  return [...groups]
    .map(([regionName, entries]) => ({
      region: regionName,
      locations: entries,
    }))
    .sort((a, b) => a.region.localeCompare(b.region));
};

/** Lowest measured ping among locations the selection leaves open. */
export const fastestAllowedLocation = (
  locations: readonly ServerPickerLocation[],
  blocked: ReadonlySet<string>,
  latencies: readonly ServerPickerLatency[],
): { location: ServerPickerLocation; latencyMs: number } | null => {
  const byId = new Map(locations.map((location) => [location.id, location]));
  let fastest: { location: ServerPickerLocation; latencyMs: number } | null =
    null;
  for (const { locationId, latencyMs } of latencies) {
    const location = byId.get(locationId);
    if (!location || latencyMs == null || blocked.has(locationId)) continue;
    if (!fastest || latencyMs < fastest.latencyMs)
      fastest = { location, latencyMs };
  }
  return fastest;
};

/** Ids between two locations in display order, inclusive, for shift-click. */
export const pickerLocationRange = (
  order: readonly string[],
  anchor: string,
  target: string,
): string[] => {
  const from = order.indexOf(anchor);
  const to = order.indexOf(target);
  if (from === -1 || to === -1) return [target];
  return order.slice(Math.min(from, to), Math.max(from, to) + 1);
};

// deadlock-api names partner-hosted datacenters "<site>-<host>"; Valve's SDR
// config lists the same POPs as "d<site>" (dpkt) or the bare site (Hetzner).
const DATACENTER_HOST_PREFIXES = new Map([
  ["dpkt", "d"],
  ["hetz", ""],
]);

/**
 * The picker location a deadlock-api datacenter code ("fra2", "hel-hetz",
 * "fra-dpkt") belongs to. Numbered codes name a building inside a POP, so the
 * digits are dropped unless the catalog lists the numbered POP itself (sto2).
 */
export const datacenterLocation = (
  code: string,
  locationIds: ReadonlySet<string>,
): string | null => {
  for (const part of code.split(",")) {
    const [site, host] = part.trim().toLowerCase().split("-");
    const id =
      host === undefined
        ? site
        : `${DATACENTER_HOST_PREFIXES.get(host) ?? ""}${site}`;
    if (locationIds.has(id)) return id;
    const pop = id.replace(/\d+$/, "");
    if (locationIds.has(pop)) return pop;
  }
  return null;
};

/** Months of match history the picker counts, including the current one. */
export const RECENT_MATCH_MONTHS = 3;

/** Matches per picker location over the last few calendar months (UTC). */
export const recentMatchesByLocation = (
  history: readonly RegionHistoryEntry[],
  locations: readonly ServerPickerLocation[],
  now: Date,
): Map<string, number> => {
  const ids = new Set(locations.map((location) => location.id));
  const since =
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() - (RECENT_MATCH_MONTHS - 1),
      1,
    ) / 1000;
  const counts = new Map<string, number>();
  for (const entry of history) {
    if (entry.month < since || !entry.datacenter) continue;
    const id = datacenterLocation(entry.datacenter, ids);
    if (id) counts.set(id, (counts.get(id) ?? 0) + entry.matches);
  }
  return counts;
};
