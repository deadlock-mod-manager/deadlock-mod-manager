import { z } from "zod";
import { STATS_TTL } from "@/lib/stats/cache";
import { defaultView } from "../layout";
import {
  daysParam,
  globalPreset,
  numberParam,
  type PresetDef,
  pick,
  ratio,
  sinceDays,
  tabulate,
  textParam,
} from "./kit";
import { gameStatsSchema, itemWinsSchema } from "./player";

/** Presets about everyone's matches; no account needed. */

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

const sinceParam = (params: Record<string, string | number>) =>
  sinceDays(numberParam(params, "days", 30));

const share = <T>(items: T[], count: (item: T) => number) => {
  const total = items.reduce((sum, item) => sum + count(item), 0);
  return (item: T) => ratio(count(item), total);
};

export const GLOBAL_PRESETS: PresetDef[] = [
  globalPreset({
    id: "global.heroes",
    category: "global",
    endpoint: "/v1/analytics/hero-stats",
    ttl: STATS_TTL.benchmark,
    params: [daysParam(30)],
    view: defaultView("barHorizontal", {
      x: "heroId",
      y: ["winrate"],
      sortBy: "winrate",
      limit: 15,
    }),
    size: { w: 6, h: 9 },
    load: async ({ params, api }) => {
      const heroes = await api.list(
        `/v1/analytics/hero-stats?min_unix_timestamp=${sinceParam(params)}`,
        analyticsHeroSchema,
      );
      // Twelve heroes per match, so the hero-matches total over 12 is the
      // number of games.
      const games =
        heroes.reduce((total, hero) => total + hero.matches, 0) / 12;
      return tabulate(heroes, [
        ["heroId", "hero", (hero) => hero.hero_id],
        ["matches", "integer", (hero) => hero.matches],
        ["winrate", "percent", (hero) => ratio(hero.wins, hero.matches)],
        ["pickRate", "percent", (hero) => ratio(hero.matches, games)],
        [
          "kda",
          "decimal",
          (hero) =>
            (hero.total_kills + hero.total_assists) /
            Math.max(hero.total_deaths, 1),
        ],
        [
          "killsPerMatch",
          "decimal",
          (hero) => ratio(hero.total_kills, hero.matches),
        ],
        [
          "deathsPerMatch",
          "decimal",
          (hero) => ratio(hero.total_deaths, hero.matches),
        ],
        [
          "netWorthPerMatch",
          "number",
          (hero) => ratio(hero.total_net_worth, hero.matches),
        ],
        [
          "damagePerMatch",
          "number",
          (hero) => ratio(hero.total_player_damage, hero.matches),
        ],
        [
          "accuracy",
          "percent",
          (hero) =>
            ratio(
              hero.total_shots_hit,
              hero.total_shots_hit + hero.total_shots_missed,
            ),
        ],
      ]);
    },
  }),
  globalPreset({
    id: "global.heroTrend",
    category: "global",
    endpoint: "/v1/analytics/hero-stats",
    ttl: STATS_TTL.benchmark,
    params: [{ key: "hero", kind: "hero", default: 1 }, daysParam(30)],
    view: defaultView("line", { x: "day", y: ["winrate"] }),
    size: { w: 6, h: 6 },
    load: async ({ params, api }) => {
      const heroId = numberParam(params, "hero", 1);
      const rows = await api.list(
        `/v1/analytics/hero-stats?bucket=start_time_day&min_unix_timestamp=${sinceParam(params)}`,
        analyticsHeroSchema,
      );
      return tabulate(
        rows
          .filter((row) => row.hero_id === heroId)
          .sort((a, b) => a.bucket - b.bucket),
        [
          ["day", "date", (row) => row.bucket],
          ["matches", "integer", (row) => row.matches],
          ["winrate", "percent", (row) => ratio(row.wins, row.matches)],
          [
            "killsPerMatch",
            "decimal",
            (row) => ratio(row.total_kills, row.matches),
          ],
          [
            "netWorthPerMatch",
            "number",
            (row) => ratio(row.total_net_worth, row.matches),
          ],
        ],
      );
    },
  }),
  globalPreset({
    id: "global.bans",
    category: "global",
    endpoint: "/v1/analytics/hero-ban-stats",
    ttl: STATS_TTL.benchmark,
    params: [daysParam(30)],
    view: defaultView("barHorizontal", {
      x: "heroId",
      y: ["bans"],
      sortBy: "bans",
      limit: 15,
    }),
    size: { w: 6, h: 9 },
    load: async ({ params, api }) => {
      const bans = await api.list(
        `/v1/analytics/hero-ban-stats?min_unix_timestamp=${sinceParam(params)}`,
        banSchema,
      );
      return tabulate(bans, [
        ["heroId", "hero", (entry) => entry.hero_id],
        ["bans", "integer", (entry) => entry.bans],
        ["banShare", "percent", share(bans, (entry) => entry.bans)],
      ]);
    },
  }),
  globalPreset({
    id: "global.duos",
    category: "global",
    endpoint: "/v1/analytics/hero-comb-stats",
    ttl: STATS_TTL.benchmark,
    params: [daysParam(30)],
    view: defaultView("barHorizontal", {
      x: "heroes",
      y: ["winrate"],
      sortBy: "winrate",
      limit: 10,
    }),
    size: { w: 6, h: 8 },
    load: async ({ params, api }) =>
      tabulate(
        await api.list(
          `/v1/analytics/hero-comb-stats?comb_size=2&min_matches=1000&min_unix_timestamp=${sinceParam(params)}`,
          comboSchema,
        ),
        [
          ["heroes", "heroList", (combo) => combo.hero_ids.join(",")],
          ["matches", "integer", (combo) => combo.matches],
          ["winrate", "percent", (combo) => ratio(combo.wins, combo.matches)],
        ],
      ),
  }),
  globalPreset({
    id: "global.daily",
    category: "global",
    endpoint: "/v1/analytics/game-stats",
    ttl: STATS_TTL.distribution,
    params: [daysParam(30)],
    view: defaultView("area", { x: "day", y: ["matches"] }),
    size: { w: 6, h: 6 },
    load: async ({ params, api }) =>
      tabulate(
        (
          await api.list(
            `/v1/analytics/game-stats?bucket=start_time_day&min_unix_timestamp=${sinceParam(params)}`,
            gameStatsSchema,
          )
        ).sort((a, b) => a.bucket - b.bucket),
        [
          ["day", "date", (row) => row.bucket],
          ["matches", "integer", pick("total_matches")],
          ["players", "integer", pick("total_players")],
          ["avgDuration", "clock", pick("avg_duration_s")],
          ["avgKills", "decimal", pick("avg_kills")],
          ["avgNetWorth", "number", pick("avg_net_worth")],
          ["avgPlayerDamage", "number", pick("avg_player_damage")],
          ["midBossKillRate", "percent", pick("mid_boss_kill_rate")],
          ["abandonRate", "percent", pick("abandon_rate")],
        ],
      ),
  }),
  globalPreset({
    id: "global.scoreboard",
    category: "global",
    endpoint: "/v1/analytics/scoreboards/heroes",
    ttl: STATS_TTL.benchmark,
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
    load: async ({ params, api }) => {
      const sortBy = textParam(params, "sortBy", "avg_kills_per_match");
      return tabulate(
        await api.list(
          `/v1/analytics/scoreboards/heroes?sort_by=${encodeURIComponent(sortBy)}&min_unix_timestamp=${sinceParam(params)}`,
          scoreboardSchema,
        ),
        [
          ["heroId", "hero", (row) => row.hero_id],
          [
            "value",
            sortBy === "winrate" ? "percent" : "decimal",
            (row) => row.value,
            { labelKey: `stats.dashboard.options.scoreboard.${sortBy}` },
          ],
          ["matches", "integer", (row) => row.matches],
        ],
      );
    },
  }),
  globalPreset({
    id: "global.items",
    category: "items",
    endpoint: "/v1/analytics/item-stats",
    ttl: STATS_TTL.benchmark,
    params: [daysParam(30)],
    view: defaultView("barHorizontal", {
      x: "itemId",
      y: ["winrate"],
      sortBy: "winrate",
      limit: 15,
    }),
    size: { w: 6, h: 9 },
    load: async ({ params, api }) =>
      tabulate(
        await api.list(
          `/v1/analytics/item-stats?min_matches=1000&min_unix_timestamp=${sinceParam(params)}`,
          itemWinsSchema,
        ),
        [
          ["itemId", "item", (item) => item.item_id],
          ["matches", "integer", (item) => item.matches],
          ["winrate", "percent", (item) => ratio(item.wins, item.matches)],
          ["avgBuyTime", "clock", (item) => item.avg_buy_time_s],
        ],
      ),
  }),
  globalPreset({
    id: "global.rankDistribution",
    category: "ranked",
    endpoint: "/v1/players/rank/distribution",
    ttl: STATS_TTL.distribution,
    view: defaultView("bar", { x: "badge", y: ["players"] }),
    size: { w: 12, h: 6 },
    load: async ({ api }) => {
      const rows = (
        await api.list("/v1/players/rank/distribution", rankDistributionSchema)
      ).sort((a, b) => a.badge - b.badge);
      return tabulate(rows, [
        ["badge", "badge", (row) => row.badge],
        ["players", "integer", (row) => row.players],
        ["playerShare", "percent", share(rows, (row) => row.players)],
      ]);
    },
  }),
];
