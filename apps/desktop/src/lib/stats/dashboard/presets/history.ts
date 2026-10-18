import type { MatchHistoryEntry } from "@/lib/stats/api";
import {
  chronological,
  formCurve,
  isWin,
  streaks,
  summarize,
} from "@/lib/stats/derive";
import type { Dataset } from "../dataset";
import {
  defaultView,
  type MatchGroup,
  type MatchMetric,
  type MatchQuery,
  matchQuerySchema,
} from "../layout";
import { GROUP_FIELD, runMatchQuery } from "../match-query";
import {
  daysAgo,
  daysParam,
  historyPreset,
  lastMatchesOf,
  numberParam,
  type PresetDef,
  tabulate,
  windowParam,
} from "./kit";

/** Presets derived from the match history; they cannot break with the API. */

const newest = <T>(items: T[], count: number | null) =>
  count === null ? items : items.slice(-count);

const perMinute = (value: number, match: MatchHistoryEntry) =>
  match.match_duration_s > 0 ? value / (match.match_duration_s / 60) : 0;

/** A match query whose group column carries a preset-specific name. */
const grouped = (
  matches: MatchHistoryEntry[],
  query: Partial<MatchQuery> & { metrics: MatchMetric[]; groupBy: MatchGroup },
  key: string,
): Dataset => {
  const dataset = runMatchQuery(matches, matchQuerySchema.parse(query));
  return {
    fields: dataset.fields.map((field) =>
      field.key === GROUP_FIELD ? { ...field, key } : field,
    ),
    rows: dataset.rows.map(({ [GROUP_FIELD]: group, ...rest }) =>
      Object.assign({ [key]: group ?? null }, rest),
    ),
  };
};

const bucketPreset = (
  id: string,
  groupBy: MatchGroup,
  key: string,
): PresetDef =>
  historyPreset({
    id,
    category: "you",
    params: [windowParam(0)],
    view: defaultView("bar", { x: key, y: ["winrate"], showLabels: true }),
    size: { w: 6, h: 6 },
    build: (matches, params) =>
      grouped(
        matches,
        {
          metrics: ["winrate", "matches", "kda"],
          groupBy,
          lastMatches: lastMatchesOf(params),
        },
        key,
      ),
  });

export const HISTORY_PRESETS: PresetDef[] = [
  historyPreset({
    id: "you.summary",
    category: "you",
    params: [windowParam(30)],
    view: defaultView("kpi", { y: ["winrate"] }),
    size: { w: 3, h: 3 },
    build: (matches, params) => {
      const ordered = chronological(matches);
      const summary = summarize(newest(ordered, lastMatchesOf(params)));
      const streak = streaks(ordered);
      const cutoff = daysAgo(30);
      return tabulate(summary.matches === 0 ? [] : [summary], [
        ["matches", "integer", (s) => s.matches],
        ["wins", "integer", (s) => s.wins],
        ["winrate", "percent", (s) => s.winrate],
        ["kda", "decimal", (s) => s.kda],
        ["kills", "decimal", (s) => s.kills],
        ["deaths", "decimal", (s) => s.deaths],
        ["assists", "decimal", (s) => s.assists],
        ["soulsPerMin", "number", (s) => s.soulsPerMin],
        ["lastHitsPerMin", "decimal", (s) => s.lastHitsPerMin],
        ["durationMin", "decimal", (s) => s.avgDurationMin],
        ["currentStreak", "integer", () => streak.current],
        ["longestWinStreak", "integer", () => streak.longestWin],
        ["longestLossStreak", "integer", () => streak.longestLoss],
        [
          "matchesLast30Days",
          "integer",
          () => ordered.filter((match) => match.start_time >= cutoff).length,
        ],
      ]);
    },
  }),
  historyPreset({
    id: "you.form",
    category: "you",
    params: [
      {
        key: "window",
        kind: "select",
        default: 20,
        options: [10, 20, 30, 50].map((count) => ({
          value: count,
          label: "rollingWindow",
          count,
        })),
      },
    ],
    view: defaultView("area", { x: "startTime", y: ["winrate"] }),
    size: { w: 12, h: 7 },
    build: (matches, params) =>
      tabulate(formCurve(matches, numberParam(params, "window", 20)), [
        ["startTime", "date", (point) => point.startTime],
        // The form curve is in percent; the dashboard keeps fractions.
        ["winrate", "percent", (point) => point.winrate / 100],
      ]),
  }),
  historyPreset({
    id: "you.matchLog",
    category: "you",
    params: [windowParam(50)],
    view: defaultView("line", {
      x: "startTime",
      y: ["kills", "deaths", "assists"],
    }),
    size: { w: 12, h: 7 },
    build: (matches, params) =>
      tabulate(newest(chronological(matches), lastMatchesOf(params)), [
        ["startTime", "date", (match) => match.start_time],
        ["heroId", "hero", (match) => match.hero_id],
        ["result", "result", (match) => (isWin(match) ? 1 : 0)],
        ["kills", "integer", (match) => match.player_kills],
        ["deaths", "integer", (match) => match.player_deaths],
        ["assists", "integer", (match) => match.player_assists],
        [
          "kda",
          "decimal",
          (match) =>
            (match.player_kills + match.player_assists) /
            Math.max(match.player_deaths, 1),
        ],
        ["netWorth", "number", (match) => match.net_worth],
        ["soulsPerMin", "number", (match) => perMinute(match.net_worth, match)],
        ["lastHits", "integer", (match) => match.last_hits],
        ["denies", "integer", (match) => match.denies],
        ["durationMin", "decimal", (match) => match.match_duration_s / 60],
        ["heroLevel", "integer", (match) => match.hero_level],
        ["rankBadge", "badge", (match) => match.ranked_display_badge],
      ]),
  }),
  bucketPreset("you.byHour", "hour", "hour"),
  bucketPreset("you.byWeekday", "weekday", "weekday"),
  bucketPreset("you.session", "session", "session"),
  bucketPreset("you.byDuration", "duration", "durationMin"),
  historyPreset({
    id: "you.daily",
    category: "you",
    params: [daysParam(30, [7, 14, 30, 90])],
    view: defaultView("stackedBar", { x: "day", y: ["wins", "losses"] }),
    size: { w: 12, h: 6 },
    build: (matches, params) =>
      grouped(
        matches,
        {
          metrics: ["wins", "losses", "matches", "winrate"],
          groupBy: "day",
          sinceDays: numberParam(params, "days", 30),
        },
        "day",
      ),
  }),
  historyPreset({
    id: "you.results",
    category: "you",
    params: [windowParam(0)],
    view: defaultView("donut", { x: "result", y: ["matches"] }),
    size: { w: 4, h: 6 },
    build: (matches, params) =>
      grouped(
        matches,
        {
          metrics: ["matches"],
          groupBy: "result",
          lastMatches: lastMatchesOf(params),
        },
        "result",
      ),
  }),
  historyPreset({
    id: "you.rankHistory",
    category: "ranked",
    params: [windowParam(0)],
    view: defaultView("line", { x: "startTime", y: ["rankBadge"] }),
    size: { w: 6, h: 6 },
    build: (matches, params) =>
      tabulate(
        newest(
          // Placements carry badge 0; plotting them would drop the line to the
          // bottom between ranked games.
          chronological(matches).filter(
            (match) => (match.ranked_display_badge ?? 0) > 0,
          ),
          lastMatchesOf(params),
        ),
        [
          ["startTime", "date", (match) => match.start_time],
          ["rankBadge", "badge", (match) => match.ranked_display_badge],
          ["rankDelta", "integer", (match) => match.ranked_delta],
        ],
      ),
  }),
];
