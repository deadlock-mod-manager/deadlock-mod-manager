import type { MatchHistoryEntry } from "@/lib/stats/api";
import { chronological, isWin, sessionPositions } from "@/lib/stats/derive";
import type { Dataset, DatasetField, DatasetRow, FieldFormat } from "./dataset";
import type {
  MatchAggregate,
  MatchGroup,
  MatchMetric,
  MatchQuery,
} from "./layout";

/**
 * The "build your own stat" engine: filters, groups and aggregates the match
 * history the page already holds. Costs no request, so it can never break when
 * an endpoint changes - only the history itself has to load.
 */

const DAY_S = 24 * 60 * 60;
const DURATION_BUCKET_MIN = 5;

const MATCH_METRIC_FORMATS = {
  matches: "integer",
  wins: "integer",
  losses: "integer",
  winrate: "percent",
  kills: "decimal",
  deaths: "decimal",
  assists: "decimal",
  kda: "decimal",
  netWorth: "number",
  soulsPerMin: "number",
  lastHits: "number",
  lastHitsPerMin: "decimal",
  denies: "decimal",
  durationMin: "decimal",
  heroLevel: "decimal",
  rankBadge: "badge",
  rankDelta: "decimal",
} satisfies Record<MatchMetric, FieldFormat>;

const GROUP_FORMATS = {
  match: "date",
  day: "date",
  week: "date",
  month: "date",
  hero: "hero",
  weekday: "weekday",
  hour: "hour",
  result: "result",
  session: "session",
  duration: "durationBucket",
} satisfies Record<Exclude<MatchGroup, "none">, FieldFormat>;

export const GROUP_FIELD = "group";

const minutesOf = (match: MatchHistoryEntry) => match.match_duration_s / 60;

/** One match's value for a metric; `null` when the match does not carry it. */
const perMatch = (match: MatchHistoryEntry, metric: MatchMetric) => {
  switch (metric) {
    case "matches":
      return 1;
    case "wins":
    case "winrate":
      return isWin(match) ? 1 : 0;
    case "losses":
      return isWin(match) ? 0 : 1;
    case "kills":
      return match.player_kills;
    case "deaths":
      return match.player_deaths;
    case "assists":
      return match.player_assists;
    case "kda":
      return (
        (match.player_kills + match.player_assists) /
        Math.max(match.player_deaths, 1)
      );
    case "netWorth":
      return match.net_worth;
    case "soulsPerMin":
      return minutesOf(match) > 0 ? match.net_worth / minutesOf(match) : null;
    case "lastHits":
      return match.last_hits;
    case "lastHitsPerMin":
      return minutesOf(match) > 0 ? match.last_hits / minutesOf(match) : null;
    case "denies":
      return match.denies;
    case "durationMin":
      return minutesOf(match);
    case "heroLevel":
      return match.hero_level;
    case "rankBadge":
      // Placements report badge 0, which is no rank rather than the lowest one.
      return (match.ranked_display_badge ?? 0) > 0
        ? match.ranked_display_badge
        : null;
    case "rankDelta":
      return match.ranked_delta;
  }
};

const sum = (values: number[]) =>
  values.reduce((total, value) => total + value, 0);

const reduceValues = (values: number[], aggregate: MatchAggregate) => {
  if (values.length === 0) {
    return null;
  }
  switch (aggregate) {
    case "avg":
      return sum(values) / values.length;
    case "sum":
      return sum(values);
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    case "median": {
      const sorted = [...values].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
    }
  }
};

/**
 * A metric over a group of matches. Counts ignore the aggregate, and the ratios
 * are pooled for "average": the KDA of ten matches is total kills and assists
 * over total deaths, not the mean of ten per-match ratios a deathless stomp
 * would skew.
 */
const aggregateMetric = (
  matches: MatchHistoryEntry[],
  metric: MatchMetric,
  aggregate: MatchAggregate,
): number | null => {
  if (matches.length === 0) {
    return null;
  }
  const wins = matches.filter(isWin).length;
  switch (metric) {
    case "matches":
      return matches.length;
    case "wins":
      return wins;
    case "losses":
      return matches.length - wins;
    case "winrate":
      return wins / matches.length;
  }

  if (aggregate === "avg") {
    const minutes = sum(matches.map(minutesOf));
    switch (metric) {
      case "kda":
        return (
          sum(
            matches.map((match) => match.player_kills + match.player_assists),
          ) / Math.max(sum(matches.map((match) => match.player_deaths)), 1)
        );
      case "soulsPerMin":
        return minutes > 0
          ? sum(matches.map((match) => match.net_worth)) / minutes
          : null;
      case "lastHitsPerMin":
        return minutes > 0
          ? sum(matches.map((match) => match.last_hits)) / minutes
          : null;
    }
  }

  return reduceValues(
    matches.flatMap((match) => {
      const value = perMatch(match, metric);
      return value === null ? [] : [value];
    }),
    aggregate,
  );
};

/** Local midnight, so a late-evening session stays on the day it was played. */
const startOfDay = (unix: number) => {
  const date = new Date(unix * 1000);
  date.setHours(0, 0, 0, 0);
  return date.getTime() / 1000;
};

const startOfWeek = (unix: number) => {
  const day = startOfDay(unix);
  // Monday first; `getDay` counts from Sunday.
  const offset = (new Date(day * 1000).getDay() + 6) % 7;
  return startOfDay(day - offset * DAY_S + DAY_S / 2);
};

const startOfMonth = (unix: number) => {
  const date = new Date(unix * 1000);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime() / 1000;
};

const groupKey = (
  group: Exclude<MatchGroup, "none" | "match" | "session">,
  match: MatchHistoryEntry,
): number => {
  switch (group) {
    case "day":
      return startOfDay(match.start_time);
    case "week":
      return startOfWeek(match.start_time);
    case "month":
      return startOfMonth(match.start_time);
    case "hero":
      return match.hero_id;
    case "weekday":
      return new Date(match.start_time * 1000).getDay();
    case "hour":
      return new Date(match.start_time * 1000).getHours();
    case "result":
      return isWin(match) ? 1 : 0;
    case "duration":
      return (
        Math.floor(minutesOf(match) / DURATION_BUCKET_MIN) * DURATION_BUCKET_MIN
      );
  }
};

/** Monday through Sunday rather than `getDay`'s Sunday-first order. */
const groupOrder = (group: MatchGroup, key: number) =>
  group === "weekday" ? (key + 6) % 7 : key;

export const filterMatches = (
  matches: MatchHistoryEntry[],
  query: MatchQuery,
  nowUnix: number,
): MatchHistoryEntry[] => {
  let filtered = chronological(matches);
  if (query.heroId !== null) {
    filtered = filtered.filter((match) => match.hero_id === query.heroId);
  }
  if (query.rankedOnly) {
    filtered = filtered.filter(
      (match) => (match.ranked_display_badge ?? 0) > 0,
    );
  }
  if (query.sinceDays !== null) {
    const cutoff = nowUnix - query.sinceDays * DAY_S;
    filtered = filtered.filter((match) => match.start_time >= cutoff);
  }
  if (query.lastMatches !== null) {
    filtered = filtered.slice(-query.lastMatches);
  }
  if (query.result !== "all") {
    const wanted = query.result === "wins";
    filtered = filtered.filter((match) => isWin(match) === wanted);
  }
  return filtered;
};

const metricRow = (
  matches: MatchHistoryEntry[],
  query: MatchQuery,
): DatasetRow =>
  Object.fromEntries(
    query.metrics.map((metric) => [
      metric,
      aggregateMetric(matches, metric, query.aggregate),
    ]),
  );

/**
 * Per-match rows, optionally smoothed. A rolling value is only emitted once its
 * window is full, otherwise the first few points swing between the extremes.
 */
const perMatchRows = (
  matches: MatchHistoryEntry[],
  query: MatchQuery,
): DatasetRow[] => {
  const window = query.smoothing ?? 1;
  return matches.flatMap((match, index) => {
    if (index + 1 < window) {
      return [];
    }
    const slice = matches.slice(index + 1 - window, index + 1);
    return [
      {
        [GROUP_FIELD]: match.start_time,
        ...(window > 1
          ? metricRow(slice, { ...query, aggregate: "avg" })
          : Object.fromEntries(
              query.metrics.map((metric) => [metric, perMatch(match, metric)]),
            )),
      },
    ];
  });
};

export const runMatchQuery = (
  matches: MatchHistoryEntry[],
  query: MatchQuery,
  nowUnix = Date.now() / 1000,
): Dataset => {
  const filtered = filterMatches(matches, query, nowUnix);
  const valueFields: DatasetField[] = query.metrics.map((metric) => ({
    key: metric,
    format: MATCH_METRIC_FORMATS[metric],
  }));

  if (query.groupBy === "none") {
    return {
      fields: valueFields,
      rows: filtered.length > 0 ? [metricRow(filtered, query)] : [],
    };
  }

  const fields = [
    {
      key: GROUP_FIELD,
      format: GROUP_FORMATS[query.groupBy],
      labelKey: `stats.dashboard.matchQuery.groups.${query.groupBy}`,
    },
    ...valueFields,
  ];

  if (query.groupBy === "match") {
    return { fields, rows: perMatchRows(filtered, query) };
  }

  const groups = new Map<number, MatchHistoryEntry[]>();
  const add = (key: number, match: MatchHistoryEntry) => {
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(match);
    } else {
      groups.set(key, [match]);
    }
  };

  if (query.groupBy === "session") {
    // Positions come from the unfiltered history: filtering to one hero must
    // not turn a session's third match into its first.
    const kept = new Set(filtered.map((match) => match.match_id));
    for (const { match, position } of sessionPositions(matches)) {
      if (kept.has(match.match_id)) {
        add(position, match);
      }
    }
  } else {
    const group = query.groupBy;
    for (const match of filtered) {
      add(groupKey(group, match), match);
    }
  }

  const rows = [...groups.entries()]
    .sort(
      ([a], [b]) => groupOrder(query.groupBy, a) - groupOrder(query.groupBy, b),
    )
    .map(([key, bucket]) =>
      Object.assign({ [GROUP_FIELD]: key }, metricRow(bucket, query)),
    );

  return { fields, rows };
};
