import type { PerformanceCurvePoint } from "@/lib/stats/api";

/**
 * Grades for the match being played, against players on the same hero in the
 * same rank bracket at the same point of their matches. Souls and objective
 * damage pile up faster as a match goes on, so a whole-match rate would mark
 * every early game as behind; the bracket's curve compares like with like.
 */

/** Souls first: it is the number the rest of the Live tab is built around. */
const LIVE_METRICS = [
  "soulsPerMin",
  "kills",
  "deaths",
  "assists",
  "objectiveDamagePerMin",
] as const;
export type LiveMetric = (typeof LIVE_METRICS)[number];

/** Which curve stat each metric is compared on: totals so far, not rates. */
const CURVE_STATS = {
  kills: "kills",
  deaths: "deaths",
  assists: "assists",
  soulsPerMin: "net_worth",
  objectiveDamagePerMin: "boss_damage",
} as const satisfies Record<LiveMetric, string>;
type CurveStat = (typeof CURVE_STATS)[LiveMetric];

const PER_MINUTE = new Set<LiveMetric>([
  "soulsPerMin",
  "objectiveDamagePerMin",
]);

export const GRADES = ["D", "C", "B", "A", "S"] as const;
export type Grade = (typeof GRADES)[number];

/** Where each grade starts, as the share of the bracket the player beats. */
export const GRADE_STARTS = [0, 0.25, 0.5, 0.75, 0.9] as const;

export const gradeFor = (beats: number): Grade => {
  let grade: Grade = "D";
  GRADE_STARTS.forEach((start, index) => {
    if (beats >= start) grade = GRADES[index] ?? grade;
  });
  return grade;
};

export interface LiveGradeRow {
  metric: LiveMetric;
  /** What the player has right now: a count, or a rate per minute. */
  value: number;
  /** The bracket's average at this point of the match, on the same scale. */
  average: number;
  /** Share of the bracket the player is ahead of, 0-1, flipped for deaths. */
  beats: number;
  grade: Grade;
}

export interface LivePlayerNumbers {
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  souls: number | null;
  objectiveDamage: number | null;
}

/** Grades only mean something once a little of the match has been played. */
export const MIN_GRADED_MINUTES = 1;

/** Standard normal CDF (Abramowitz-Stegun 7.1.26, error below 1.5e-7). */
const normalCdf = (z: number): number => {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    t *
    (0.254829592 +
      t *
        (-0.284496736 +
          t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
};

/**
 * Mean and spread of one stat at `seconds`, linear between the curve's steps.
 * Every stat starts the match at zero, which anchors the part before the first
 * step; past the last step the last one holds.
 */
export const curveAt = (
  curve: PerformanceCurvePoint[],
  stat: CurveStat,
  seconds: number,
): { avg: number; std: number } | null => {
  const points = [...curve].sort((a, b) => a.game_time - b.game_time);
  const last = points[points.length - 1];
  if (!last) return null;
  const read = (point: PerformanceCurvePoint) => ({
    time: point.game_time,
    avg: point[`${stat}_avg`],
    std: point[`${stat}_std`],
  });
  let previous = { time: 0, avg: 0, std: 0 };
  for (const point of points) {
    const next = read(point);
    if (seconds <= next.time) {
      const span = next.time - previous.time;
      const t = span > 0 ? (seconds - previous.time) / span : 1;
      return {
        avg: previous.avg + t * (next.avg - previous.avg),
        std: previous.std + t * (next.std - previous.std),
      };
    }
    previous = next;
  }
  return { avg: previous.avg, std: previous.std };
};

const totalOf = (
  metric: LiveMetric,
  player: LivePlayerNumbers,
): number | null => {
  switch (metric) {
    case "kills":
      return player.kills;
    case "deaths":
      return player.deaths;
    case "assists":
      return player.assists;
    case "soulsPerMin":
      return player.souls;
    case "objectiveDamagePerMin":
      return player.objectiveDamage;
  }
};

export const liveGradeRows = ({
  player,
  minutes,
  curve,
}: {
  player: LivePlayerNumbers;
  minutes: number;
  curve: PerformanceCurvePoint[];
}): LiveGradeRow[] => {
  if (minutes < MIN_GRADED_MINUTES || curve.length === 0) return [];
  const seconds = minutes * 60;

  return LIVE_METRICS.flatMap((metric) => {
    const total = totalOf(metric, player);
    const expected = curveAt(curve, CURVE_STATS[metric], seconds);
    if (total === null || !expected) return [];

    // A bracket where everyone sits on the same number has no spread to place
    // the player in; above or below it is all there is to say.
    const below =
      expected.std > 0
        ? normalCdf((total - expected.avg) / expected.std)
        : total > expected.avg
          ? 0.75
          : total < expected.avg
            ? 0.25
            : 0.5;
    const beats = metric === "deaths" ? 1 - below : below;
    const scale = PER_MINUTE.has(metric) ? minutes : 1;
    return [
      {
        metric,
        value: total / scale,
        average: expected.avg / scale,
        beats,
        grade: gradeFor(beats),
      },
    ];
  });
};

/** One grade for the match so far: the average share of the bracket beaten. */
export const overallGrade = (
  rows: LiveGradeRow[],
): { beats: number; grade: Grade } | null => {
  if (rows.length === 0) return null;
  const beats = rows.reduce((sum, row) => sum + row.beats, 0) / rows.length;
  return { beats, grade: gradeFor(beats) };
};
