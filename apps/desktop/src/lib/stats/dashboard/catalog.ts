import {
  ProviderError,
  RuntimeError,
} from "@deadlock-mods/common/client-errors";
import { z } from "zod";
import {
  getItemStats,
  getSteamProfiles,
  type MatchHistoryEntry,
  requestJson,
} from "@/lib/stats/api";
import { STATS_TTL } from "@/lib/stats/cache";
import {
  chronological,
  formCurve,
  isWin,
  joinItemStats,
  joinMateStats,
  streaks,
  summarize,
} from "@/lib/stats/derive";
import { itemStatsSchema, mateStatsSchema } from "@/lib/validation/stats-api";
import type { Dataset, DatasetField, FieldFormat } from "./dataset";
import {
  defaultView,
  type MatchMetric,
  type MatchQuery,
  matchQuerySchema,
  type WidgetView,
} from "./layout";
import { GROUP_FIELD, runMatchQuery } from "./match-query";

/**
 * The ready-made values the "+" dialog offers. Every remote preset declares the
 * fields it needs as required: when deadlock-api renames or drops one, the
 * response stops parsing and the widget reports the endpoint as changed instead
 * of quietly drawing zeros.
 *
 * Last checked against the live API on 2026-10-15. Rerun with
 * `pnpm check:dashboard-endpoints`; the stats-dashboard-endpoints skill covers
 * fixing what it finds.
 */

export class DashboardSchemaError extends ProviderError {
  constructor(readonly endpoint: string) {
    super(`deadlock-api ${endpoint} no longer matches the dashboard schema`);
  }
}

export const PRESET_CATEGORIES = [
  "you",
  "heroes",
  "items",
  "squad",
  "ranked",
  "global",
] as const;
export type PresetCategory = (typeof PRESET_CATEGORIES)[number];

export type ParamValue = string | number;
export type PresetParams = Record<string, ParamValue>;

export interface PresetParamOption {
  value: ParamValue;
  /** i18n key under `stats.dashboard.options`, interpolated with `count`. */
  label: string;
  count?: number;
}

export interface PresetParam {
  key: string;
  kind: "select" | "hero";
  default: ParamValue;
  options?: PresetParamOption[];
}

export interface PresetContext {
  accountId: number | null;
  matches: MatchHistoryEntry[];
}

export type PresetQuery =
  | { kind: "local"; build: () => Dataset }
  | {
      kind: "remote";
      cacheKey: string;
      /** Account-bound keys are dropped by the manual refresh. */
      playerScoped: boolean;
      ttl: number;
      endpoint: string;
      load: () => Promise<Dataset>;
    };

export interface PresetDef {
  id: string;
  category: PresetCategory;
  /** Shown on broken widgets so the user can tell which request failed. */
  endpoint: string;
  needsAccount: boolean;
  /** Joins with or derives from the match history the page loads. */
  needsHistory: boolean;
  params: PresetParam[];
  view: WidgetView;
  size: { w: number; h: number };
  query: (ctx: PresetContext, params: PresetParams) => PresetQuery;
}

const DAY_S = 24 * 60 * 60;
const HISTORY_ENDPOINT = "/v1/players/{account_id}/match-history";

const nowUnix = () => Math.floor(Date.now() / 1000);
/** Day-aligned, so the URL - and with it the API's own cache - is stable all day. */
const sinceDays = (days: number) =>
  Math.floor((nowUnix() - days * DAY_S) / DAY_S) * DAY_S;

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

const field = (
  key: string,
  format: FieldFormat,
  extra: Partial<DatasetField> = {},
): DatasetField => ({ key, format, ...extra });

const numberParam = (params: PresetParams, key: string, fallback: number) => {
  const value = Number(params[key]);
  return Number.isFinite(value) ? value : fallback;
};

const textParam = (params: PresetParams, key: string, fallback: string) => {
  const value = params[key];
  return value === undefined ? fallback : String(value);
};

/** Parses a list response; a non-empty list where no row parses has changed shape. */
const fetchList = async <T>(
  path: string,
  endpoint: string,
  schema: z.ZodType<T>,
): Promise<T[]> => {
  const payload = await requestJson(path);
  if (!Array.isArray(payload)) {
    throw new DashboardSchemaError(endpoint);
  }
  const rows = payload.flatMap((entry) => {
    const parsed = schema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
  if (payload.length > 0 && rows.length === 0) {
    throw new DashboardSchemaError(endpoint);
  }
  return rows;
};

const fetchOne = async <T>(
  path: string,
  endpoint: string,
  schema: z.ZodType<T>,
): Promise<T> => {
  const parsed = schema.safeParse(await requestJson(path));
  if (!parsed.success) {
    throw new DashboardSchemaError(endpoint);
  }
  return parsed.data;
};

// History fingerprint for remote presets that join with it: a new match changes
// the key, so the join is redone instead of served from yesterday's cache.
const historyKey = (matches: MatchHistoryEntry[]) =>
  `${matches.length}:${matches.reduce((latest, match) => Math.max(latest, match.match_id), 0)}`;

const local = (build: () => Dataset): PresetQuery => ({ kind: "local", build });

const remote = (
  cacheKey: string,
  endpoint: string,
  load: () => Promise<Dataset>,
  { playerScoped, ttl }: { playerScoped: boolean; ttl: number },
): PresetQuery => ({
  kind: "remote",
  cacheKey: `${playerScoped ? "player:" : ""}dashboard:${cacheKey}`,
  playerScoped,
  ttl,
  endpoint,
  load,
});

/** Widgets gate account-bound presets before querying, so this is a bug guard. */
const requireAccount = (ctx: PresetContext): number => {
  if (ctx.accountId === null) {
    throw new RuntimeError("account-bound dashboard preset ran without one");
  }
  return ctx.accountId;
};

const matchQuery = (query: Partial<MatchQuery> & { metrics: MatchMetric[] }) =>
  matchQuerySchema.parse(query);

const relabelGroup = (dataset: Dataset, key: string): Dataset => ({
  fields: dataset.fields.map((entry) =>
    entry.key === GROUP_FIELD ? { ...entry, key } : entry,
  ),
  rows: dataset.rows.map(({ [GROUP_FIELD]: group, ...rest }) => ({
    [key]: group ?? null,
    ...rest,
  })),
});

const WINDOW_OPTIONS: PresetParamOption[] = [
  { value: 0, label: "allMatches" },
  ...[10, 20, 30, 50, 100].map((count) => ({
    value: count,
    label: "lastMatches",
    count,
  })),
];

const DAY_OPTIONS = (days: number[]): PresetParamOption[] =>
  days.map((count) => ({ value: count, label: "lastDays", count }));

const windowParam = (fallback: number): PresetParam => ({
  key: "window",
  kind: "select",
  default: fallback,
  options: WINDOW_OPTIONS,
});

const daysParam = (fallback: number, days = [7, 30, 90]): PresetParam => ({
  key: "days",
  kind: "select",
  default: fallback,
  options: DAY_OPTIONS(days),
});

const lastMatchesOf = (params: PresetParams) => {
  const window = numberParam(params, "window", 0);
  return window > 0 ? window : null;
};

const playerHeroSchema = z.object({
  hero_id: z.number(),
  matches_played: z.number(),
  wins: z.number(),
  kills: z.number(),
  deaths: z.number(),
  assists: z.number(),
  time_played: z.number(),
  networth_per_min: z.number(),
  damage_per_min: z.number(),
  damage_taken_per_min: z.number(),
  obj_damage_per_min: z.number(),
  last_hits_per_min: z.number(),
  denies_per_match: z.number(),
  accuracy: z.number(),
  crit_shot_rate: z.number(),
  ending_level: z.number(),
});

const counterSchema = z.object({
  hero_id: z.number(),
  enemy_hero_id: z.number(),
  wins: z.number(),
  matches_played: z.number(),
  kills: z.number(),
  deaths: z.number(),
  networth: z.number(),
  enemy_networth: z.number(),
});

const numberRecord = z.record(z.string(), z.union([z.number(), z.null()]));

const curveSchema = z
  .object({ game_time: z.number(), net_worth_avg: z.number() })
  .and(numberRecord);

const gameStatsSchema = z
  .object({
    bucket: z.number(),
    total_matches: z.number(),
    avg_kills: z.number(),
    avg_net_worth: z.number(),
  })
  .and(numberRecord);

const percentileSchema = z.object({
  avg: z.number(),
  percentile10: z.number(),
  percentile25: z.number(),
  percentile50: z.number(),
  percentile75: z.number(),
  percentile90: z.number(),
});

const buffSchema = z.object({
  buff_type: z.string(),
  matches: z.number(),
  matches_with_pickup: z.number(),
  pickups: z.number(),
  avg_pickup_time_s: z.number().nullish(),
  avg_first_pickup_time_s: z.number().nullish(),
});

const enemySchema = z.object({
  enemy_id: z.number(),
  wins: z.number(),
  matches_played: z.number(),
});

const rankSchema = z.object({
  badge: z.number(),
  rank: z.number(),
  subrank: z.number(),
});

const analyticsHeroSchema = z.object({
  hero_id: z.number(),
  bucket: z.number(),
  matches: z.number(),
  wins: z.number(),
  total_kills: z.number(),
  total_deaths: z.number(),
  total_assists: z.number(),
  total_net_worth: z.number(),
  total_player_damage: z.number(),
  total_shots_hit: z.number(),
  total_shots_missed: z.number(),
});

const banSchema = z.object({ hero_id: z.number(), bans: z.number() });

const comboSchema = z.object({
  hero_ids: z.array(z.number()),
  wins: z.number(),
  matches: z.number(),
});

const scoreboardSchema = z.object({
  hero_id: z.number(),
  value: z.number(),
  matches: z.number(),
});

const rankDistributionSchema = z.object({
  badge: z.number(),
  players: z.number(),
});

const localPresets: PresetDef[] = [
  {
    id: "you.summary",
    category: "you",
    endpoint: HISTORY_ENDPOINT,
    needsAccount: true,
    needsHistory: true,
    params: [windowParam(30)],
    view: defaultView("kpi", { y: ["winrate"] }),
    size: { w: 3, h: 3 },
    query: (ctx, params) =>
      local(() => {
        const window = lastMatchesOf(params);
        const ordered = chronological(ctx.matches);
        const summary = summarize(
          window === null ? ordered : ordered.slice(-window),
        );
        const streak = streaks(ordered);
        const cutoff = nowUnix() - 30 * DAY_S;
        return {
          fields: [
            field("matches", "integer"),
            field("wins", "integer"),
            field("winrate", "percent"),
            field("kda", "decimal"),
            field("kills", "decimal"),
            field("deaths", "decimal"),
            field("assists", "decimal"),
            field("soulsPerMin", "number"),
            field("lastHitsPerMin", "decimal"),
            field("durationMin", "decimal"),
            field("currentStreak", "integer"),
            field("longestWinStreak", "integer"),
            field("longestLossStreak", "integer"),
            field("matchesLast30Days", "integer"),
          ],
          rows:
            summary.matches === 0
              ? []
              : [
                  {
                    matches: summary.matches,
                    wins: summary.wins,
                    winrate: summary.winrate,
                    kda: summary.kda,
                    kills: summary.kills,
                    deaths: summary.deaths,
                    assists: summary.assists,
                    soulsPerMin: summary.soulsPerMin,
                    lastHitsPerMin: summary.lastHitsPerMin,
                    durationMin: summary.avgDurationMin,
                    currentStreak: streak.current,
                    longestWinStreak: streak.longestWin,
                    longestLossStreak: streak.longestLoss,
                    matchesLast30Days: ordered.filter(
                      (match) => match.start_time >= cutoff,
                    ).length,
                  },
                ],
        };
      }),
  },
  {
    id: "you.form",
    category: "you",
    endpoint: HISTORY_ENDPOINT,
    needsAccount: true,
    needsHistory: true,
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
    query: (ctx, params) =>
      local(() => ({
        fields: [field("startTime", "date"), field("winrate", "percent")],
        rows: formCurve(ctx.matches, numberParam(params, "window", 20)).map(
          (point) => ({
            startTime: point.startTime,
            winrate: point.winrate / 100,
          }),
        ),
      })),
  },
  {
    id: "you.matchLog",
    category: "you",
    endpoint: HISTORY_ENDPOINT,
    needsAccount: true,
    needsHistory: true,
    params: [windowParam(50)],
    view: defaultView("line", {
      x: "startTime",
      y: ["kills", "deaths", "assists"],
    }),
    size: { w: 12, h: 7 },
    query: (ctx, params) =>
      local(() => {
        const window = lastMatchesOf(params);
        const ordered = chronological(ctx.matches);
        return {
          fields: [
            field("startTime", "date"),
            field("heroId", "hero"),
            field("result", "result"),
            field("kills", "integer"),
            field("deaths", "integer"),
            field("assists", "integer"),
            field("kda", "decimal"),
            field("netWorth", "number"),
            field("soulsPerMin", "number"),
            field("lastHits", "integer"),
            field("denies", "integer"),
            field("durationMin", "decimal"),
            field("heroLevel", "integer"),
            field("rankBadge", "badge"),
          ],
          rows: (window === null ? ordered : ordered.slice(-window)).map(
            (match) => {
              const minutes = match.match_duration_s / 60;
              return {
                startTime: match.start_time,
                heroId: match.hero_id,
                result: isWin(match) ? 1 : 0,
                kills: match.player_kills,
                deaths: match.player_deaths,
                assists: match.player_assists,
                kda:
                  (match.player_kills + match.player_assists) /
                  Math.max(match.player_deaths, 1),
                netWorth: match.net_worth,
                soulsPerMin: minutes > 0 ? match.net_worth / minutes : 0,
                lastHits: match.last_hits,
                denies: match.denies,
                durationMin: minutes,
                heroLevel: match.hero_level,
                rankBadge: match.ranked_display_badge,
              };
            },
          ),
        };
      }),
  },
  ...(
    [
      ["you.byHour", "hour", "hour"],
      ["you.byWeekday", "weekday", "weekday"],
      ["you.session", "session", "session"],
      ["you.byDuration", "duration", "durationMin"],
    ] as const
  ).map(
    ([id, groupBy, key]): PresetDef => ({
      id,
      category: "you",
      endpoint: HISTORY_ENDPOINT,
      needsAccount: true,
      needsHistory: true,
      params: [windowParam(0)],
      view: defaultView("bar", { x: key, y: ["winrate"], showLabels: true }),
      size: { w: 6, h: 6 },
      query: (ctx, params) =>
        local(() =>
          relabelGroup(
            runMatchQuery(
              ctx.matches,
              matchQuery({
                metrics: ["winrate", "matches", "kda"],
                groupBy,
                lastMatches: lastMatchesOf(params),
              }),
            ),
            key,
          ),
        ),
    }),
  ),
  {
    id: "you.daily",
    category: "you",
    endpoint: HISTORY_ENDPOINT,
    needsAccount: true,
    needsHistory: true,
    params: [daysParam(30, [7, 14, 30, 90])],
    view: defaultView("stackedBar", { x: "day", y: ["wins", "losses"] }),
    size: { w: 12, h: 6 },
    query: (ctx, params) =>
      local(() =>
        relabelGroup(
          runMatchQuery(
            ctx.matches,
            matchQuery({
              metrics: ["wins", "losses", "matches", "winrate"],
              groupBy: "day",
              sinceDays: numberParam(params, "days", 30),
            }),
          ),
          "day",
        ),
      ),
  },
  {
    id: "you.results",
    category: "you",
    endpoint: HISTORY_ENDPOINT,
    needsAccount: true,
    needsHistory: true,
    params: [windowParam(0)],
    view: defaultView("donut", { x: "result", y: ["matches"] }),
    size: { w: 4, h: 6 },
    query: (ctx, params) =>
      local(() =>
        relabelGroup(
          runMatchQuery(
            ctx.matches,
            matchQuery({
              metrics: ["matches"],
              groupBy: "result",
              lastMatches: lastMatchesOf(params),
            }),
          ),
          "result",
        ),
      ),
  },
  {
    id: "you.rankHistory",
    category: "ranked",
    endpoint: HISTORY_ENDPOINT,
    needsAccount: true,
    needsHistory: true,
    params: [windowParam(0)],
    view: defaultView("line", { x: "startTime", y: ["rankBadge"] }),
    size: { w: 6, h: 6 },
    query: (ctx, params) =>
      local(() => {
        const window = lastMatchesOf(params);
        // Placements carry badge 0; plotting them would drop the line to the
        // bottom between ranked games.
        const ranked = chronological(ctx.matches).filter(
          (match) => (match.ranked_display_badge ?? 0) > 0,
        );
        return {
          fields: [
            field("startTime", "date"),
            field("rankBadge", "badge"),
            field("rankDelta", "integer"),
          ],
          rows: (window === null ? ranked : ranked.slice(-window)).map(
            (match) => ({
              startTime: match.start_time,
              rankBadge: match.ranked_display_badge,
              rankDelta: match.ranked_delta,
            }),
          ),
        };
      }),
  },
];

const GOLD_PREFIX = "avg_gold_";
// Souls lost on death and souls denied to the enemy are not income.
const NOT_INCOME = new Set(["death_loss", "denied"]);

const playerPresets: PresetDef[] = [
  {
    id: "you.heroes",
    category: "heroes",
    endpoint: "/v1/players/hero-stats",
    needsAccount: true,
    needsHistory: false,
    params: [],
    view: defaultView("barHorizontal", {
      x: "heroId",
      y: ["winrate"],
      sortBy: "matches",
      limit: 10,
    }),
    size: { w: 6, h: 8 },
    query: (ctx) => {
      const accountId = requireAccount(ctx);
      const endpoint = "/v1/players/hero-stats";
      return remote(
        `heroes:${accountId}`,
        endpoint,
        async () => {
          const heroes = await fetchList(
            `${endpoint}?account_ids=${accountId}`,
            endpoint,
            playerHeroSchema,
          );
          return {
            fields: [
              field("heroId", "hero"),
              field("matches", "integer"),
              field("wins", "integer"),
              field("winrate", "percent"),
              field("kda", "decimal"),
              field("killsPerMatch", "decimal"),
              field("deathsPerMatch", "decimal"),
              field("assistsPerMatch", "decimal"),
              field("soulsPerMin", "number"),
              field("damagePerMin", "number"),
              field("damageTakenPerMin", "number"),
              field("objDamagePerMin", "number"),
              field("lastHitsPerMin", "decimal"),
              field("deniesPerMatch", "decimal"),
              field("accuracy", "percent"),
              field("critRate", "percent"),
              field("hoursPlayed", "decimal"),
              field("endingLevel", "decimal"),
            ],
            rows: heroes
              .filter((hero) => hero.matches_played > 0)
              .map((hero) => ({
                heroId: hero.hero_id,
                matches: hero.matches_played,
                wins: hero.wins,
                winrate: ratio(hero.wins, hero.matches_played),
                kda: (hero.kills + hero.assists) / Math.max(hero.deaths, 1),
                killsPerMatch: ratio(hero.kills, hero.matches_played),
                deathsPerMatch: ratio(hero.deaths, hero.matches_played),
                assistsPerMatch: ratio(hero.assists, hero.matches_played),
                soulsPerMin: hero.networth_per_min,
                damagePerMin: hero.damage_per_min,
                damageTakenPerMin: hero.damage_taken_per_min,
                objDamagePerMin: hero.obj_damage_per_min,
                lastHitsPerMin: hero.last_hits_per_min,
                deniesPerMatch: hero.denies_per_match,
                accuracy: hero.accuracy,
                critRate: hero.crit_shot_rate,
                hoursPlayed: hero.time_played / 3600,
                endingLevel: hero.ending_level,
              })),
          };
        },
        { playerScoped: true, ttl: STATS_TTL.heroStats },
      );
    },
  },
  {
    id: "you.matchups",
    category: "heroes",
    endpoint: "/v1/analytics/hero-counter-stats",
    needsAccount: true,
    needsHistory: false,
    params: [{ key: "hero", kind: "hero", default: 0 }],
    view: defaultView("barHorizontal", {
      x: "enemyHeroId",
      y: ["winrate"],
      sortBy: "winrate",
      sortDirection: "asc",
      limit: 10,
    }),
    size: { w: 6, h: 8 },
    query: (ctx, params) => {
      const accountId = requireAccount(ctx);
      const heroId = numberParam(params, "hero", 0);
      const endpoint = "/v1/analytics/hero-counter-stats";
      return remote(
        `matchups:${heroId}:${accountId}`,
        endpoint,
        async () => {
          const rows = await fetchList(
            `${endpoint}?account_id=${accountId}&min_matches=2`,
            endpoint,
            counterSchema,
          );
          const byEnemy = new Map<
            number,
            {
              wins: number;
              matches: number;
              kills: number;
              deaths: number;
              soulDiff: number;
            }
          >();
          for (const row of rows) {
            if (heroId !== 0 && row.hero_id !== heroId) {
              continue;
            }
            const entry = byEnemy.get(row.enemy_hero_id) ?? {
              wins: 0,
              matches: 0,
              kills: 0,
              deaths: 0,
              soulDiff: 0,
            };
            entry.wins += row.wins;
            entry.matches += row.matches_played;
            entry.kills += row.kills;
            entry.deaths += row.deaths;
            entry.soulDiff += row.networth - row.enemy_networth;
            byEnemy.set(row.enemy_hero_id, entry);
          }
          return {
            fields: [
              field("enemyHeroId", "hero"),
              field("matches", "integer"),
              field("winrate", "percent"),
              field("killsPerMatch", "decimal"),
              field("deathsPerMatch", "decimal"),
              field("soulLead", "number"),
            ],
            rows: [...byEnemy.entries()]
              .filter(([, entry]) => entry.matches >= 3)
              .map(([enemyHeroId, entry]) => ({
                enemyHeroId,
                matches: entry.matches,
                winrate: ratio(entry.wins, entry.matches),
                killsPerMatch: ratio(entry.kills, entry.matches),
                deathsPerMatch: ratio(entry.deaths, entry.matches),
                soulLead: ratio(entry.soulDiff, entry.matches),
              })),
          };
        },
        { playerScoped: true, ttl: STATS_TTL.heroStats },
      );
    },
  },
  {
    id: "you.performanceCurve",
    category: "you",
    endpoint: "/v1/analytics/player-performance-curve",
    needsAccount: true,
    needsHistory: false,
    params: [],
    view: defaultView("area", { x: "gameTime", y: ["netWorth"] }),
    size: { w: 6, h: 6 },
    query: (ctx) => {
      const accountId = requireAccount(ctx);
      const endpoint = "/v1/analytics/player-performance-curve";
      const columns = [
        ["netWorth", "net_worth_avg", "number"],
        ["kills", "kills_avg", "decimal"],
        ["deaths", "deaths_avg", "decimal"],
        ["assists", "assists_avg", "decimal"],
        ["playerDamage", "player_damage_avg", "number"],
        ["bossDamage", "boss_damage_avg", "number"],
        ["creepKills", "creep_kills_avg", "decimal"],
        ["neutralKills", "neutral_kills_avg", "decimal"],
        ["denies", "denies_avg", "decimal"],
        ["playerHealing", "player_healing_avg", "number"],
        ["permanentBuffs", "permanent_buffs_avg", "decimal"],
      ] as const;
      return remote(
        `curve:${accountId}`,
        endpoint,
        async () => {
          const rows = await fetchList(
            `${endpoint}?account_ids=${accountId}`,
            endpoint,
            curveSchema,
          );
          return {
            fields: [
              field("gameTime", "percentPoints"),
              ...columns.map(([key, , format]) => field(key, format)),
            ],
            rows: rows.map((row) =>
              Object.fromEntries([
                ["gameTime", row.game_time],
                ...columns.map(([key, source]) => [key, row[source] ?? null]),
              ]),
            ),
          };
        },
        { playerScoped: true, ttl: STATS_TTL.heroStats },
      );
    },
  },
  {
    id: "you.soulSources",
    category: "you",
    endpoint: "/v1/analytics/game-stats",
    needsAccount: true,
    needsHistory: false,
    params: [],
    view: defaultView("donut", { x: "source", y: ["souls"] }),
    size: { w: 4, h: 7 },
    query: (ctx) => {
      const accountId = requireAccount(ctx);
      const endpoint = "/v1/analytics/game-stats";
      return remote(
        `soul-sources:${accountId}`,
        endpoint,
        async () => {
          const [stats] = await fetchList(
            `${endpoint}?account_ids=${accountId}`,
            endpoint,
            gameStatsSchema,
          );
          const sources = Object.entries(stats ?? {}).flatMap(
            ([key, value]) => {
              const source = key.slice(GOLD_PREFIX.length);
              return key.startsWith(GOLD_PREFIX) &&
                !NOT_INCOME.has(source) &&
                value !== null &&
                value > 0
                ? [{ source, souls: value }]
                : [];
            },
          );
          return {
            fields: [
              field("source", "text", {
                valueLabels: "stats.dashboard.soulSources",
              }),
              field("souls", "number"),
            ],
            rows: sources,
          };
        },
        { playerScoped: true, ttl: STATS_TTL.heroStats },
      );
    },
  },
  {
    id: "you.averages",
    category: "you",
    endpoint: "/v1/analytics/game-stats",
    needsAccount: true,
    needsHistory: false,
    params: [],
    view: defaultView("kpi", { y: ["avgPlayerDamage"] }),
    size: { w: 3, h: 3 },
    query: (ctx) => {
      const accountId = requireAccount(ctx);
      const endpoint = "/v1/analytics/game-stats";
      const columns = [
        ["matches", "total_matches", "integer"],
        ["avgKills", "avg_kills", "decimal"],
        ["avgDeaths", "avg_deaths", "decimal"],
        ["avgAssists", "avg_assists", "decimal"],
        ["avgNetWorth", "avg_net_worth", "number"],
        ["avgLastHits", "avg_last_hits", "decimal"],
        ["avgDenies", "avg_denies", "decimal"],
        ["avgPlayerDamage", "avg_player_damage", "number"],
        ["avgDamageTaken", "avg_player_damage_taken", "number"],
        ["avgDamageMitigated", "avg_damage_mitigated", "number"],
        ["avgBossDamage", "avg_boss_damage", "number"],
        ["avgHealing", "avg_player_healing", "number"],
        ["avgCreepKills", "avg_creep_kills", "decimal"],
        ["avgNeutralKills", "avg_neutral_kills", "decimal"],
        ["accuracy", "avg_accuracy", "percent"],
        ["critRate", "avg_crit_rate", "percent"],
        ["endingLevel", "avg_ending_level", "decimal"],
        ["avgDuration", "avg_duration_s", "clock"],
        ["permanentBuffs", "avg_permanent_buffs", "decimal"],
      ] as const;
      return remote(
        `averages:${accountId}`,
        endpoint,
        async () => {
          const [stats] = await fetchList(
            `${endpoint}?account_ids=${accountId}`,
            endpoint,
            gameStatsSchema,
          );
          return {
            fields: columns.map(([key, , format]) => field(key, format)),
            rows: stats
              ? [
                  Object.fromEntries(
                    columns.map(([key, source]) => [
                      key,
                      stats[source] ?? null,
                    ]),
                  ),
                ]
              : [],
          };
        },
        { playerScoped: true, ttl: STATS_TTL.heroStats },
      );
    },
  },
  {
    id: "you.percentiles",
    category: "you",
    endpoint: "/v1/analytics/player-stats/metrics",
    needsAccount: true,
    needsHistory: false,
    params: [],
    view: defaultView("table", {
      x: "metric",
      y: ["p10", "median", "avg", "p90"],
    }),
    size: { w: 6, h: 8 },
    query: (ctx) => {
      const accountId = requireAccount(ctx);
      const endpoint = "/v1/analytics/player-stats/metrics";
      return remote(
        `percentiles:${accountId}`,
        endpoint,
        async () => {
          const metrics = await fetchOne(
            `${endpoint}?account_ids=${accountId}`,
            endpoint,
            z.record(z.string(), percentileSchema),
          );
          return {
            fields: [
              field("metric", "text", {
                valueLabels: "stats.dashboard.metrics",
              }),
              field("p10", "decimal"),
              field("p25", "decimal"),
              field("median", "decimal"),
              field("avg", "decimal"),
              field("p75", "decimal"),
              field("p90", "decimal"),
            ],
            rows: Object.entries(metrics).map(([metric, entry]) => ({
              metric,
              p10: entry.percentile10,
              p25: entry.percentile25,
              median: entry.percentile50,
              avg: entry.avg,
              p75: entry.percentile75,
              p90: entry.percentile90,
            })),
          };
        },
        { playerScoped: true, ttl: STATS_TTL.heroStats },
      );
    },
  },
  {
    id: "you.buffs",
    category: "you",
    endpoint: "/v1/analytics/buff-stats",
    needsAccount: true,
    needsHistory: false,
    params: [],
    view: defaultView("barHorizontal", {
      x: "buff",
      y: ["pickups"],
      sortBy: "pickups",
      limit: 10,
    }),
    size: { w: 6, h: 7 },
    query: (ctx) => {
      const accountId = requireAccount(ctx);
      const endpoint = "/v1/analytics/buff-stats";
      return remote(
        `buffs:${accountId}`,
        endpoint,
        async () => {
          const buffs = await fetchList(
            `${endpoint}?account_ids=${accountId}`,
            endpoint,
            buffSchema,
          );
          return {
            fields: [
              field("buff", "text", { valueLabels: "stats.dashboard.buffs" }),
              field("pickups", "integer"),
              field("pickupsPerMatch", "decimal"),
              field("pickupRate", "percent"),
              field("avgPickupTime", "clock"),
              field("avgFirstPickupTime", "clock"),
            ],
            rows: buffs.map((buff) => ({
              buff: buff.buff_type,
              pickups: buff.pickups,
              pickupsPerMatch: ratio(buff.pickups, buff.matches),
              pickupRate: ratio(buff.matches_with_pickup, buff.matches),
              avgPickupTime: buff.avg_pickup_time_s ?? null,
              avgFirstPickupTime: buff.avg_first_pickup_time_s ?? null,
            })),
          };
        },
        { playerScoped: true, ttl: STATS_TTL.heroStats },
      );
    },
  },
  {
    id: "you.items",
    category: "items",
    endpoint: "/v1/analytics/item-stats",
    needsAccount: true,
    needsHistory: false,
    params: [],
    view: defaultView("barHorizontal", {
      x: "itemId",
      y: ["winrateDelta"],
      sortBy: "matches",
      limit: 10,
    }),
    size: { w: 6, h: 8 },
    query: (ctx) => {
      const accountId = requireAccount(ctx);
      const endpoint = "/v1/analytics/item-stats";
      return remote(
        `items:${accountId}`,
        endpoint,
        async () => {
          const [mine, global] = await Promise.all([
            fetchList(
              `${endpoint}?min_matches=3&account_id=${accountId}`,
              endpoint,
              itemStatsSchema.extend({ wins: z.number(), matches: z.number() }),
            ),
            getItemStats({ minMatches: 1000 }),
          ]);
          return {
            fields: [
              field("itemId", "item"),
              field("matches", "integer"),
              field("winrate", "percent"),
              field("globalWinrate", "percent"),
              field("winrateDelta", "signedPercent"),
              field("avgBuyTime", "clock"),
            ],
            rows: joinItemStats(mine, global).map((item) => ({
              itemId: item.itemId,
              matches: item.matches,
              winrate: item.winrate,
              globalWinrate: item.globalWinrate,
              winrateDelta: item.winrateDelta,
              avgBuyTime: item.avgBuyTimeS,
            })),
          };
        },
        { playerScoped: true, ttl: STATS_TTL.heroStats },
      );
    },
  },
  {
    id: "you.mates",
    category: "squad",
    endpoint: "/v1/players/{account_id}/mate-stats",
    needsAccount: true,
    needsHistory: true,
    params: [],
    view: defaultView("barHorizontal", {
      x: "name",
      y: ["winrateDelta"],
      sortBy: "matches",
      limit: 10,
    }),
    size: { w: 6, h: 8 },
    query: (ctx) => {
      const accountId = requireAccount(ctx);
      const endpoint = "/v1/players/{account_id}/mate-stats";
      return remote(
        `mates:${accountId}:${historyKey(ctx.matches)}`,
        endpoint,
        async () => {
          const mates = joinMateStats(
            await fetchList(
              `/v1/players/${accountId}/mate-stats?min_matches_played=3`,
              endpoint,
              mateStatsSchema.extend({ matches: z.array(z.number()) }),
            ),
            ctx.matches,
          ).slice(0, 50);
          const profiles = await getSteamProfiles(
            mates.map((mate) => mate.mateId),
          );
          const names = new Map(
            profiles.map((profile) => [
              profile.account_id,
              profile.personaname,
            ]),
          );
          return {
            fields: [
              field("name", "text"),
              field("matches", "integer"),
              field("winrate", "percent"),
              field("winrateDelta", "signedPercent"),
              field("kda", "decimal"),
            ],
            rows: mates.map((mate) => ({
              name: names.get(mate.mateId) || `#${mate.mateId}`,
              matches: mate.matchesTogether,
              winrate: mate.winrateTogether,
              winrateDelta: mate.winrateDelta,
              kda: mate.kdaTogether,
            })),
          };
        },
        { playerScoped: true, ttl: STATS_TTL.mates },
      );
    },
  },
  {
    id: "you.enemies",
    category: "squad",
    endpoint: "/v1/players/{account_id}/enemy-stats",
    needsAccount: true,
    needsHistory: false,
    params: [],
    view: defaultView("table", {
      x: "name",
      y: ["matches", "winrate"],
      sortBy: "matches",
      limit: 10,
    }),
    size: { w: 6, h: 8 },
    query: (ctx) => {
      const accountId = requireAccount(ctx);
      const endpoint = "/v1/players/{account_id}/enemy-stats";
      return remote(
        `enemies:${accountId}`,
        endpoint,
        async () => {
          const enemies = (
            await fetchList(
              `/v1/players/${accountId}/enemy-stats?min_matches_played=3`,
              endpoint,
              enemySchema,
            )
          )
            .sort((a, b) => b.matches_played - a.matches_played)
            .slice(0, 50);
          const profiles = await getSteamProfiles(
            enemies.map((enemy) => enemy.enemy_id),
          );
          const names = new Map(
            profiles.map((profile) => [
              profile.account_id,
              profile.personaname,
            ]),
          );
          return {
            fields: [
              field("name", "text"),
              field("matches", "integer"),
              field("winrate", "percent"),
            ],
            rows: enemies.map((enemy) => ({
              name: names.get(enemy.enemy_id) || `#${enemy.enemy_id}`,
              matches: enemy.matches_played,
              winrate: ratio(enemy.wins, enemy.matches_played),
            })),
          };
        },
        { playerScoped: true, ttl: STATS_TTL.mates },
      );
    },
  },
  {
    id: "you.rank",
    category: "ranked",
    endpoint: "/v1/players/{account_id}/rank",
    needsAccount: true,
    needsHistory: false,
    params: [],
    view: defaultView("kpi", { y: ["badge"] }),
    size: { w: 3, h: 3 },
    query: (ctx) => {
      const accountId = requireAccount(ctx);
      const endpoint = "/v1/players/{account_id}/rank";
      return remote(
        `rank:${accountId}`,
        endpoint,
        async () => {
          const rank = await fetchOne(
            `/v1/players/${accountId}/rank`,
            endpoint,
            rankSchema,
          );
          return {
            fields: [
              field("badge", "badge"),
              field("rank", "integer"),
              field("subrank", "integer"),
            ],
            rows: [
              { badge: rank.badge, rank: rank.rank, subrank: rank.subrank },
            ],
          };
        },
        { playerScoped: true, ttl: STATS_TTL.rank },
      );
    },
  },
];

const SCOREBOARD_SORTS = [
  "winrate",
  "matches",
  "avg_kills_per_match",
  "avg_deaths_per_match",
  "avg_assists_per_match",
  "avg_net_worth_per_match",
  "avg_player_damage_per_match",
  "avg_last_hits_per_match",
  "avg_denies_per_match",
  "avg_boss_damage_per_match",
] as const;

const globalPresets: PresetDef[] = [
  {
    id: "global.heroes",
    category: "global",
    endpoint: "/v1/analytics/hero-stats",
    needsAccount: false,
    needsHistory: false,
    params: [daysParam(30)],
    view: defaultView("barHorizontal", {
      x: "heroId",
      y: ["winrate"],
      sortBy: "winrate",
      limit: 15,
    }),
    size: { w: 6, h: 9 },
    query: (_ctx, params) => {
      const days = numberParam(params, "days", 30);
      const endpoint = "/v1/analytics/hero-stats";
      return remote(
        `global-heroes:${days}`,
        endpoint,
        async () => {
          const heroes = await fetchList(
            `${endpoint}?min_unix_timestamp=${sinceDays(days)}`,
            endpoint,
            analyticsHeroSchema,
          );
          // Twelve heroes per match, so the hero-matches total over 12 is the
          // number of games.
          const games =
            heroes.reduce((total, hero) => total + hero.matches, 0) / 12;
          return {
            fields: [
              field("heroId", "hero"),
              field("matches", "integer"),
              field("winrate", "percent"),
              field("pickRate", "percent"),
              field("kda", "decimal"),
              field("killsPerMatch", "decimal"),
              field("deathsPerMatch", "decimal"),
              field("netWorthPerMatch", "number"),
              field("damagePerMatch", "number"),
              field("accuracy", "percent"),
            ],
            rows: heroes.map((hero) => ({
              heroId: hero.hero_id,
              matches: hero.matches,
              winrate: ratio(hero.wins, hero.matches),
              pickRate: ratio(hero.matches, games),
              kda:
                (hero.total_kills + hero.total_assists) /
                Math.max(hero.total_deaths, 1),
              killsPerMatch: ratio(hero.total_kills, hero.matches),
              deathsPerMatch: ratio(hero.total_deaths, hero.matches),
              netWorthPerMatch: ratio(hero.total_net_worth, hero.matches),
              damagePerMatch: ratio(hero.total_player_damage, hero.matches),
              accuracy: ratio(
                hero.total_shots_hit,
                hero.total_shots_hit + hero.total_shots_missed,
              ),
            })),
          };
        },
        { playerScoped: false, ttl: STATS_TTL.benchmark },
      );
    },
  },
  {
    id: "global.heroTrend",
    category: "global",
    endpoint: "/v1/analytics/hero-stats",
    needsAccount: false,
    needsHistory: false,
    params: [{ key: "hero", kind: "hero", default: 1 }, daysParam(30)],
    view: defaultView("line", { x: "day", y: ["winrate"] }),
    size: { w: 6, h: 6 },
    query: (_ctx, params) => {
      const days = numberParam(params, "days", 30);
      const heroId = numberParam(params, "hero", 1);
      const endpoint = "/v1/analytics/hero-stats";
      return remote(
        `hero-trend:${heroId}:${days}`,
        endpoint,
        async () => {
          const rows = await fetchList(
            `${endpoint}?bucket=start_time_day&min_unix_timestamp=${sinceDays(days)}`,
            endpoint,
            analyticsHeroSchema,
          );
          return {
            fields: [
              field("day", "date"),
              field("matches", "integer"),
              field("winrate", "percent"),
              field("killsPerMatch", "decimal"),
              field("netWorthPerMatch", "number"),
            ],
            rows: rows
              .filter((row) => row.hero_id === heroId)
              .sort((a, b) => a.bucket - b.bucket)
              .map((row) => ({
                day: row.bucket,
                matches: row.matches,
                winrate: ratio(row.wins, row.matches),
                killsPerMatch: ratio(row.total_kills, row.matches),
                netWorthPerMatch: ratio(row.total_net_worth, row.matches),
              })),
          };
        },
        { playerScoped: false, ttl: STATS_TTL.benchmark },
      );
    },
  },
  {
    id: "global.bans",
    category: "global",
    endpoint: "/v1/analytics/hero-ban-stats",
    needsAccount: false,
    needsHistory: false,
    params: [daysParam(30)],
    view: defaultView("barHorizontal", {
      x: "heroId",
      y: ["bans"],
      sortBy: "bans",
      limit: 15,
    }),
    size: { w: 6, h: 9 },
    query: (_ctx, params) => {
      const days = numberParam(params, "days", 30);
      const endpoint = "/v1/analytics/hero-ban-stats";
      return remote(
        `bans:${days}`,
        endpoint,
        async () => {
          const bans = await fetchList(
            `${endpoint}?min_unix_timestamp=${sinceDays(days)}`,
            endpoint,
            banSchema,
          );
          const total = bans.reduce((sum, entry) => sum + entry.bans, 0);
          return {
            fields: [
              field("heroId", "hero"),
              field("bans", "integer"),
              field("banShare", "percent"),
            ],
            rows: bans.map((entry) => ({
              heroId: entry.hero_id,
              bans: entry.bans,
              banShare: ratio(entry.bans, total),
            })),
          };
        },
        { playerScoped: false, ttl: STATS_TTL.benchmark },
      );
    },
  },
  {
    id: "global.duos",
    category: "global",
    endpoint: "/v1/analytics/hero-comb-stats",
    needsAccount: false,
    needsHistory: false,
    params: [daysParam(30)],
    view: defaultView("barHorizontal", {
      x: "heroes",
      y: ["winrate"],
      sortBy: "winrate",
      limit: 10,
    }),
    size: { w: 6, h: 8 },
    query: (_ctx, params) => {
      const days = numberParam(params, "days", 30);
      const endpoint = "/v1/analytics/hero-comb-stats";
      return remote(
        `duos:${days}`,
        endpoint,
        async () => {
          const combos = await fetchList(
            `${endpoint}?comb_size=2&min_matches=1000&min_unix_timestamp=${sinceDays(days)}`,
            endpoint,
            comboSchema,
          );
          return {
            fields: [
              field("heroes", "heroList"),
              field("matches", "integer"),
              field("winrate", "percent"),
            ],
            rows: combos.map((combo) => ({
              heroes: combo.hero_ids.join(","),
              matches: combo.matches,
              winrate: ratio(combo.wins, combo.matches),
            })),
          };
        },
        { playerScoped: false, ttl: STATS_TTL.benchmark },
      );
    },
  },
  {
    id: "global.daily",
    category: "global",
    endpoint: "/v1/analytics/game-stats",
    needsAccount: false,
    needsHistory: false,
    params: [daysParam(30)],
    view: defaultView("area", { x: "day", y: ["matches"] }),
    size: { w: 6, h: 6 },
    query: (_ctx, params) => {
      const days = numberParam(params, "days", 30);
      const endpoint = "/v1/analytics/game-stats";
      const columns = [
        ["matches", "total_matches", "integer"],
        ["players", "total_players", "integer"],
        ["avgDuration", "avg_duration_s", "clock"],
        ["avgKills", "avg_kills", "decimal"],
        ["avgNetWorth", "avg_net_worth", "number"],
        ["avgPlayerDamage", "avg_player_damage", "number"],
        ["midBossKillRate", "mid_boss_kill_rate", "percent"],
        ["abandonRate", "abandon_rate", "percent"],
      ] as const;
      return remote(
        `daily:${days}`,
        endpoint,
        async () => {
          const rows = await fetchList(
            `${endpoint}?bucket=start_time_day&min_unix_timestamp=${sinceDays(days)}`,
            endpoint,
            gameStatsSchema,
          );
          return {
            fields: [
              field("day", "date"),
              ...columns.map(([key, , format]) => field(key, format)),
            ],
            rows: rows
              .sort((a, b) => a.bucket - b.bucket)
              .map((row) =>
                Object.fromEntries([
                  ["day", row.bucket],
                  ...columns.map(([key, source]) => [key, row[source] ?? null]),
                ]),
              ),
          };
        },
        { playerScoped: false, ttl: STATS_TTL.distribution },
      );
    },
  },
  {
    id: "global.scoreboard",
    category: "global",
    endpoint: "/v1/analytics/scoreboards/heroes",
    needsAccount: false,
    needsHistory: false,
    params: [
      {
        key: "sortBy",
        kind: "select",
        default: "avg_kills_per_match",
        options: SCOREBOARD_SORTS.map((sort) => ({
          value: sort,
          label: `scoreboard.${sort}`,
        })),
      },
      daysParam(30),
    ],
    view: defaultView("barHorizontal", {
      x: "heroId",
      y: ["value"],
      sortBy: "value",
      limit: 15,
    }),
    size: { w: 6, h: 9 },
    query: (_ctx, params) => {
      const days = numberParam(params, "days", 30);
      const sortBy = textParam(params, "sortBy", "avg_kills_per_match");
      const endpoint = "/v1/analytics/scoreboards/heroes";
      return remote(
        `scoreboard:${sortBy}:${days}`,
        endpoint,
        async () => {
          const rows = await fetchList(
            `${endpoint}?sort_by=${encodeURIComponent(sortBy)}&min_unix_timestamp=${sinceDays(days)}`,
            endpoint,
            scoreboardSchema,
          );
          return {
            fields: [
              field("heroId", "hero"),
              field("value", sortBy === "winrate" ? "percent" : "decimal", {
                labelKey: `stats.dashboard.options.scoreboard.${sortBy}`,
              }),
              field("matches", "integer"),
            ],
            rows: rows.map((row) => ({
              heroId: row.hero_id,
              value: row.value,
              matches: row.matches,
            })),
          };
        },
        { playerScoped: false, ttl: STATS_TTL.benchmark },
      );
    },
  },
  {
    id: "global.items",
    category: "items",
    endpoint: "/v1/analytics/item-stats",
    needsAccount: false,
    needsHistory: false,
    params: [daysParam(30)],
    view: defaultView("barHorizontal", {
      x: "itemId",
      y: ["winrate"],
      sortBy: "winrate",
      limit: 15,
    }),
    size: { w: 6, h: 9 },
    query: (_ctx, params) => {
      const days = numberParam(params, "days", 30);
      const endpoint = "/v1/analytics/item-stats";
      return remote(
        `global-items:${days}`,
        endpoint,
        async () => {
          const items = await fetchList(
            `${endpoint}?min_matches=1000&min_unix_timestamp=${sinceDays(days)}`,
            endpoint,
            itemStatsSchema.extend({ wins: z.number(), matches: z.number() }),
          );
          return {
            fields: [
              field("itemId", "item"),
              field("matches", "integer"),
              field("winrate", "percent"),
              field("avgBuyTime", "clock"),
            ],
            rows: items.map((item) => ({
              itemId: item.item_id,
              matches: item.matches,
              winrate: ratio(item.wins, item.matches),
              avgBuyTime: item.avg_buy_time_s,
            })),
          };
        },
        { playerScoped: false, ttl: STATS_TTL.benchmark },
      );
    },
  },
  {
    id: "global.rankDistribution",
    category: "ranked",
    endpoint: "/v1/players/rank/distribution",
    needsAccount: false,
    needsHistory: false,
    params: [],
    view: defaultView("bar", { x: "badge", y: ["players"] }),
    size: { w: 12, h: 6 },
    query: () => {
      const endpoint = "/v1/players/rank/distribution";
      return remote(
        "rank-distribution",
        endpoint,
        async () => {
          const rows = await fetchList(
            endpoint,
            endpoint,
            rankDistributionSchema,
          );
          const total = rows.reduce((sum, row) => sum + row.players, 0);
          return {
            fields: [
              field("badge", "badge"),
              field("players", "integer"),
              field("playerShare", "percent"),
            ],
            rows: rows
              .sort((a, b) => a.badge - b.badge)
              .map((row) => ({
                badge: row.badge,
                players: row.players,
                playerShare: ratio(row.players, total),
              })),
          };
        },
        { playerScoped: false, ttl: STATS_TTL.distribution },
      );
    },
  },
];

export const PRESETS: readonly PresetDef[] = [
  ...localPresets,
  ...playerPresets,
  ...globalPresets,
];

const presetsById = new Map(PRESETS.map((preset) => [preset.id, preset]));

export const presetById = (id: string): PresetDef | undefined =>
  presetsById.get(id);

export const defaultParams = (preset: PresetDef): PresetParams =>
  Object.fromEntries(preset.params.map((param) => [param.key, param.default]));
