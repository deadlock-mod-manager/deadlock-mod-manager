import type { PerformanceCurvePoint } from "@/lib/stats/api";

export interface LivePlayerNumbers {
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  souls: number | null;
  objectiveDamage: number | null;
}

type CurveStat = "net_worth" | "kills" | "deaths" | "assists" | "boss_damage";

const METRICS = [
  {
    metric: "soulsPerMin",
    stat: "net_worth",
    read: (player: LivePlayerNumbers) => player.souls,
    perMinute: true,
    fewerIsBetter: false,
  },
  {
    metric: "kills",
    stat: "kills",
    read: (player: LivePlayerNumbers) => player.kills,
    perMinute: false,
    fewerIsBetter: false,
  },
  {
    metric: "deaths",
    stat: "deaths",
    read: (player: LivePlayerNumbers) => player.deaths,
    perMinute: false,
    fewerIsBetter: true,
  },
  {
    metric: "assists",
    stat: "assists",
    read: (player: LivePlayerNumbers) => player.assists,
    perMinute: false,
    fewerIsBetter: false,
  },
  {
    metric: "objectiveDamagePerMin",
    stat: "boss_damage",
    read: (player: LivePlayerNumbers) => player.objectiveDamage,
    perMinute: true,
    fewerIsBetter: false,
  },
] as const satisfies readonly {
  metric: string;
  stat: CurveStat;
  read: (player: LivePlayerNumbers) => number | null;
  perMinute: boolean;
  fewerIsBetter: boolean;
}[];
export type LiveMetric = (typeof METRICS)[number]["metric"];

export const isPerMinute = (metric: LiveMetric): boolean =>
  METRICS.some((entry) => entry.metric === metric && entry.perMinute);

export const GRADES = ["D", "C", "B", "A", "S"] as const;
export type Grade = (typeof GRADES)[number];

export const GRADE_STARTS = [0, 0.25, 0.5, 0.75, 0.9] as const;

const gradeFor = (beats: number): Grade =>
  GRADES[GRADE_STARTS.filter((start) => beats >= start).length - 1] ?? "D";

export interface LiveGradeRow {
  metric: LiveMetric;
  value: number;
  average: number;
  beats: number;
  grade: Grade;
}

export const MIN_GRADED_MINUTES = 1;

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

  return METRICS.flatMap(({ metric, stat, read, perMinute, fewerIsBetter }) => {
    const total = read(player);
    const expected = curveAt(curve, stat, seconds);
    if (total === null || !expected) return [];

    const below =
      expected.std > 0
        ? normalCdf((total - expected.avg) / expected.std)
        : total > expected.avg
          ? 0.75
          : total < expected.avg
            ? 0.25
            : 0.5;
    const beats = fewerIsBetter ? 1 - below : below;
    const scale = perMinute ? minutes : 1;
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

export const overallGrade = (
  rows: LiveGradeRow[],
): { beats: number; grade: Grade } | null => {
  if (rows.length === 0) return null;
  const beats = rows.reduce((sum, row) => sum + row.beats, 0) / rows.length;
  return { beats, grade: gradeFor(beats) };
};
