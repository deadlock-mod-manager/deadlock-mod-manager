import type { MatchHistoryEntry, MetricSpread } from "@/lib/stats/api";
import type { HeroPerformance } from "@/lib/stats/derive";

const BRACKET_METRICS = [
  "damagePerMin",
  "soulsPerMin",
  "accuracy",
  "kda",
  "lastHits",
  "deaths",
] as const;
export type BracketMetric = (typeof BRACKET_METRICS)[number];

const API_KEYS = {
  damagePerMin: "player_damage_per_min",
  soulsPerMin: "net_worth_per_min",
  accuracy: "accuracy",
  kda: "kda",
  lastHits: "last_hits",
  deaths: "deaths",
} as const satisfies Record<BracketMetric, string>;

const LOWER_IS_BETTER = new Set<BracketMetric>(["deaths"]);

export interface BracketValues {
  damagePerMin?: number;
  soulsPerMin?: number;
  accuracy?: number;
  kda?: number;
  lastHits?: number;
  deaths?: number;
}

export interface BracketRow {
  metric: BracketMetric;
  mine: number;
  median: number;
  low: number;
  high: number;
  q1: number;
  q3: number;
  beats: number;
  higherIsBetter: boolean;
}

const spreadPoints = (spread: MetricSpread): Array<[number, number]> => [
  [spread.percentile1, 0.01],
  [spread.percentile5, 0.05],
  [spread.percentile10, 0.1],
  [spread.percentile25, 0.25],
  [spread.percentile50, 0.5],
  [spread.percentile75, 0.75],
  [spread.percentile90, 0.9],
  [spread.percentile95, 0.95],
  [spread.percentile99, 0.99],
];

export const shareBelow = (value: number, spread: MetricSpread): number => {
  const points = spreadPoints(spread);
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || value <= first[0]) return first ? first[1] / 2 : 0;
  if (value >= last[0]) return (1 + last[1]) / 2;

  for (let index = 1; index < points.length; index++) {
    const [upperValue, upperShare] = points[index] ?? last;
    const [lowerValue, lowerShare] = points[index - 1] ?? first;
    if (value <= upperValue) {
      const t = (value - lowerValue) / (upperValue - lowerValue);
      return lowerShare + t * (upperShare - lowerShare);
    }
  }
  return last[1];
};

export const bracketRows = (
  spreads: Record<string, MetricSpread>,
  mine: BracketValues,
): BracketRow[] =>
  BRACKET_METRICS.flatMap((metric) => {
    const spread = spreads[API_KEYS[metric]];
    const value = mine[metric];
    if (!spread || value === undefined || !Number.isFinite(value)) return [];
    const higherIsBetter = !LOWER_IS_BETTER.has(metric);
    const below = shareBelow(value, spread);
    return [
      {
        metric,
        mine: value,
        median: spread.percentile50,
        low: spread.percentile5,
        high: spread.percentile95,
        q1: spread.percentile25,
        q3: spread.percentile75,
        beats: higherIsBetter ? below : 1 - below,
        higherIsBetter,
      },
    ];
  });

export const PER_MATCH = {
  kda: (match: MatchHistoryEntry) =>
    (match.player_kills + match.player_assists) /
    Math.max(match.player_deaths, 1),
  soulsPerMin: (match: MatchHistoryEntry) =>
    match.match_duration_s > 0
      ? match.net_worth / (match.match_duration_s / 60)
      : 0,
  lastHits: (match: MatchHistoryEntry) => match.last_hits,
  deaths: (match: MatchHistoryEntry) => match.player_deaths,
} satisfies Partial<
  Record<BracketMetric, (match: MatchHistoryEntry) => number>
>;

export const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

export const playerBracketValues = (
  matches: MatchHistoryEntry[],
  heroes: HeroPerformance[],
): BracketValues => {
  const values: BracketValues = {};
  if (matches.length > 0) {
    values.kda = median(matches.map(PER_MATCH.kda));
    values.soulsPerMin = median(matches.map(PER_MATCH.soulsPerMin));
    values.lastHits = median(matches.map(PER_MATCH.lastHits));
    values.deaths = median(matches.map(PER_MATCH.deaths));
  }

  const minutes = heroes.reduce((sum, hero) => sum + hero.timePlayedMin, 0);
  if (minutes > 0) {
    const weighted = (pick: (hero: HeroPerformance) => number) =>
      heroes.reduce((sum, hero) => sum + pick(hero) * hero.timePlayedMin, 0) /
      minutes;
    values.damagePerMin = weighted((hero) => hero.damagePerMin);
    values.accuracy = weighted((hero) => hero.accuracy);
  }
  return values;
};
