import { z } from "zod";
import { getItemStats, getSteamProfiles } from "@/lib/stats/api";
import { STATS_TTL } from "@/lib/stats/cache";
import { joinItemStats, joinMateStats } from "@/lib/stats/derive";
import { itemStatsSchema, mateStatsSchema } from "@/lib/validation/stats-api";
import { defaultView } from "../layout";
import {
  type Column,
  numberParam,
  type PresetDef,
  pick,
  playerPreset,
  ratio,
  tabulate,
} from "./kit";

/** Presets about the selected account. */

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

export const gameStatsSchema = z
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

export const itemWinsSchema = itemStatsSchema.extend({
  wins: z.number(),
  matches: z.number(),
});

type GameStats = z.infer<typeof gameStatsSchema>;

const GOLD_PREFIX = "avg_gold_";
// Souls lost on death and souls denied to the enemy are not income.
const NOT_INCOME = new Set(["death_loss", "denied"]);

const AVERAGE_COLUMNS: Column<GameStats>[] = [
  ["matches", "integer", pick("total_matches")],
  ["avgKills", "decimal", pick("avg_kills")],
  ["avgDeaths", "decimal", pick("avg_deaths")],
  ["avgAssists", "decimal", pick("avg_assists")],
  ["avgNetWorth", "number", pick("avg_net_worth")],
  ["avgLastHits", "decimal", pick("avg_last_hits")],
  ["avgDenies", "decimal", pick("avg_denies")],
  ["avgPlayerDamage", "number", pick("avg_player_damage")],
  ["avgDamageTaken", "number", pick("avg_player_damage_taken")],
  ["avgDamageMitigated", "number", pick("avg_damage_mitigated")],
  ["avgBossDamage", "number", pick("avg_boss_damage")],
  ["avgHealing", "number", pick("avg_player_healing")],
  ["avgCreepKills", "decimal", pick("avg_creep_kills")],
  ["avgNeutralKills", "decimal", pick("avg_neutral_kills")],
  ["accuracy", "percent", pick("avg_accuracy")],
  ["critRate", "percent", pick("avg_crit_rate")],
  ["endingLevel", "decimal", pick("avg_ending_level")],
  ["avgDuration", "clock", pick("avg_duration_s")],
  ["permanentBuffs", "decimal", pick("avg_permanent_buffs")],
];

/** Persona names for a batch of accounts, falling back to the id. */
const personaNames = async (accountIds: number[]) => {
  const names = new Map(
    (await getSteamProfiles(accountIds)).map((profile) => [
      profile.account_id,
      profile.personaname,
    ]),
  );
  return (accountId: number) => names.get(accountId) || `#${accountId}`;
};

export const PLAYER_PRESETS: PresetDef[] = [
  playerPreset({
    id: "you.heroes",
    category: "heroes",
    endpoint: "/v1/players/hero-stats",
    ttl: STATS_TTL.heroStats,
    view: defaultView("barHorizontal", {
      x: "heroId",
      y: ["winrate"],
      sortBy: "matches",
      limit: 10,
    }),
    size: { w: 6, h: 8 },
    load: async ({ accountId, api }) =>
      tabulate(
        (
          await api.list(
            `/v1/players/hero-stats?account_ids=${accountId}`,
            playerHeroSchema,
          )
        ).filter((hero) => hero.matches_played > 0),
        [
          ["heroId", "hero", (hero) => hero.hero_id],
          ["matches", "integer", (hero) => hero.matches_played],
          ["wins", "integer", (hero) => hero.wins],
          [
            "winrate",
            "percent",
            (hero) => ratio(hero.wins, hero.matches_played),
          ],
          [
            "kda",
            "decimal",
            (hero) => (hero.kills + hero.assists) / Math.max(hero.deaths, 1),
          ],
          [
            "killsPerMatch",
            "decimal",
            (hero) => ratio(hero.kills, hero.matches_played),
          ],
          [
            "deathsPerMatch",
            "decimal",
            (hero) => ratio(hero.deaths, hero.matches_played),
          ],
          [
            "assistsPerMatch",
            "decimal",
            (hero) => ratio(hero.assists, hero.matches_played),
          ],
          ["soulsPerMin", "number", (hero) => hero.networth_per_min],
          ["damagePerMin", "number", (hero) => hero.damage_per_min],
          ["damageTakenPerMin", "number", (hero) => hero.damage_taken_per_min],
          ["objDamagePerMin", "number", (hero) => hero.obj_damage_per_min],
          ["lastHitsPerMin", "decimal", (hero) => hero.last_hits_per_min],
          ["deniesPerMatch", "decimal", (hero) => hero.denies_per_match],
          ["accuracy", "percent", (hero) => hero.accuracy],
          ["critRate", "percent", (hero) => hero.crit_shot_rate],
          ["hoursPlayed", "decimal", (hero) => hero.time_played / 3600],
          ["endingLevel", "decimal", (hero) => hero.ending_level],
        ],
      ),
  }),
  playerPreset({
    id: "you.matchups",
    category: "heroes",
    endpoint: "/v1/analytics/hero-counter-stats",
    ttl: STATS_TTL.heroStats,
    params: [{ key: "hero", kind: "hero", default: 0 }],
    view: defaultView("barHorizontal", {
      x: "enemyHeroId",
      y: ["winrate"],
      sortBy: "winrate",
      sortDirection: "asc",
      limit: 10,
    }),
    size: { w: 6, h: 8 },
    load: async ({ accountId, params, api }) => {
      const heroId = numberParam(params, "hero", 0);
      const rows = await api.list(
        `/v1/analytics/hero-counter-stats?account_id=${accountId}&min_matches=2`,
        counterSchema,
      );
      const byEnemy = new Map<
        number,
        {
          enemyHeroId: number;
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
          enemyHeroId: row.enemy_hero_id,
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
      return tabulate(
        [...byEnemy.values()].filter((entry) => entry.matches >= 3),
        [
          ["enemyHeroId", "hero", (entry) => entry.enemyHeroId],
          ["matches", "integer", (entry) => entry.matches],
          ["winrate", "percent", (entry) => ratio(entry.wins, entry.matches)],
          [
            "killsPerMatch",
            "decimal",
            (entry) => ratio(entry.kills, entry.matches),
          ],
          [
            "deathsPerMatch",
            "decimal",
            (entry) => ratio(entry.deaths, entry.matches),
          ],
          [
            "soulLead",
            "number",
            (entry) => ratio(entry.soulDiff, entry.matches),
          ],
        ],
      );
    },
  }),
  playerPreset({
    id: "you.performanceCurve",
    category: "you",
    endpoint: "/v1/analytics/player-performance-curve",
    ttl: STATS_TTL.heroStats,
    view: defaultView("area", { x: "gameTime", y: ["netWorth"] }),
    size: { w: 6, h: 6 },
    load: async ({ accountId, api }) =>
      tabulate(
        await api.list(
          `/v1/analytics/player-performance-curve?account_ids=${accountId}`,
          curveSchema,
        ),
        [
          ["gameTime", "percentPoints", (row) => row.game_time],
          ["netWorth", "number", pick("net_worth_avg")],
          ["kills", "decimal", pick("kills_avg")],
          ["deaths", "decimal", pick("deaths_avg")],
          ["assists", "decimal", pick("assists_avg")],
          ["playerDamage", "number", pick("player_damage_avg")],
          ["bossDamage", "number", pick("boss_damage_avg")],
          ["creepKills", "decimal", pick("creep_kills_avg")],
          ["neutralKills", "decimal", pick("neutral_kills_avg")],
          ["denies", "decimal", pick("denies_avg")],
          ["playerHealing", "number", pick("player_healing_avg")],
          ["permanentBuffs", "decimal", pick("permanent_buffs_avg")],
        ],
      ),
  }),
  playerPreset({
    id: "you.soulSources",
    category: "you",
    endpoint: "/v1/analytics/game-stats",
    ttl: STATS_TTL.heroStats,
    view: defaultView("donut", { x: "source", y: ["souls"] }),
    size: { w: 4, h: 7 },
    load: async ({ accountId, api }) => {
      const [stats] = await api.list(
        `/v1/analytics/game-stats?account_ids=${accountId}`,
        gameStatsSchema,
      );
      const sources = Object.entries(stats ?? {}).flatMap(([key, souls]) => {
        const source = key.slice(GOLD_PREFIX.length);
        return key.startsWith(GOLD_PREFIX) &&
          !NOT_INCOME.has(source) &&
          souls !== null &&
          souls > 0
          ? [{ source, souls }]
          : [];
      });
      return tabulate(sources, [
        [
          "source",
          "text",
          (entry) => entry.source,
          { valueLabels: "stats.dashboard.soulSources" },
        ],
        ["souls", "number", (entry) => entry.souls],
      ]);
    },
  }),
  playerPreset({
    id: "you.averages",
    category: "you",
    endpoint: "/v1/analytics/game-stats",
    ttl: STATS_TTL.heroStats,
    view: defaultView("kpi", { y: ["avgPlayerDamage"] }),
    size: { w: 3, h: 3 },
    load: async ({ accountId, api }) =>
      tabulate(
        (
          await api.list(
            `/v1/analytics/game-stats?account_ids=${accountId}`,
            gameStatsSchema,
          )
        ).slice(0, 1),
        AVERAGE_COLUMNS,
      ),
  }),
  playerPreset({
    id: "you.percentiles",
    category: "you",
    endpoint: "/v1/analytics/player-stats/metrics",
    ttl: STATS_TTL.heroStats,
    view: defaultView("table", {
      x: "metric",
      y: ["p10", "median", "avg", "p90"],
    }),
    size: { w: 6, h: 8 },
    load: async ({ accountId, api }) =>
      tabulate(
        Object.entries(
          await api.one(
            `/v1/analytics/player-stats/metrics?account_ids=${accountId}`,
            z.record(z.string(), percentileSchema),
          ),
        ),
        [
          [
            "metric",
            "text",
            ([metric]) => metric,
            { valueLabels: "stats.dashboard.metrics" },
          ],
          ["p10", "decimal", ([, entry]) => entry.percentile10],
          ["p25", "decimal", ([, entry]) => entry.percentile25],
          ["median", "decimal", ([, entry]) => entry.percentile50],
          ["avg", "decimal", ([, entry]) => entry.avg],
          ["p75", "decimal", ([, entry]) => entry.percentile75],
          ["p90", "decimal", ([, entry]) => entry.percentile90],
        ],
      ),
  }),
  playerPreset({
    id: "you.buffs",
    category: "you",
    endpoint: "/v1/analytics/buff-stats",
    ttl: STATS_TTL.heroStats,
    view: defaultView("barHorizontal", {
      x: "buff",
      y: ["pickups"],
      sortBy: "pickups",
      limit: 10,
    }),
    size: { w: 6, h: 7 },
    load: async ({ accountId, api }) =>
      tabulate(
        await api.list(
          `/v1/analytics/buff-stats?account_ids=${accountId}`,
          buffSchema,
        ),
        [
          [
            "buff",
            "text",
            (buff) => buff.buff_type,
            { valueLabels: "stats.dashboard.buffs" },
          ],
          ["pickups", "integer", (buff) => buff.pickups],
          [
            "pickupsPerMatch",
            "decimal",
            (buff) => ratio(buff.pickups, buff.matches),
          ],
          [
            "pickupRate",
            "percent",
            (buff) => ratio(buff.matches_with_pickup, buff.matches),
          ],
          ["avgPickupTime", "clock", (buff) => buff.avg_pickup_time_s ?? null],
          [
            "avgFirstPickupTime",
            "clock",
            (buff) => buff.avg_first_pickup_time_s ?? null,
          ],
        ],
      ),
  }),
  playerPreset({
    id: "you.items",
    category: "items",
    endpoint: "/v1/analytics/item-stats",
    ttl: STATS_TTL.heroStats,
    view: defaultView("barHorizontal", {
      x: "itemId",
      y: ["winrateDelta"],
      sortBy: "matches",
      limit: 10,
    }),
    size: { w: 6, h: 8 },
    load: async ({ accountId, api }) => {
      const [mine, global] = await Promise.all([
        api.list(
          `/v1/analytics/item-stats?min_matches=3&account_id=${accountId}`,
          itemWinsSchema,
        ),
        getItemStats({ minMatches: 1000 }),
      ]);
      return tabulate(joinItemStats(mine, global), [
        ["itemId", "item", (item) => item.itemId],
        ["matches", "integer", (item) => item.matches],
        ["winrate", "percent", (item) => item.winrate],
        ["globalWinrate", "percent", (item) => item.globalWinrate],
        ["winrateDelta", "signedPercent", (item) => item.winrateDelta],
        ["avgBuyTime", "clock", (item) => item.avgBuyTimeS],
      ]);
    },
  }),
  playerPreset({
    id: "you.mates",
    category: "squad",
    endpoint: "/v1/players/{account_id}/mate-stats",
    ttl: STATS_TTL.mates,
    needsHistory: true,
    view: defaultView("barHorizontal", {
      x: "name",
      y: ["winrateDelta"],
      sortBy: "matches",
      limit: 10,
    }),
    size: { w: 6, h: 8 },
    load: async ({ accountId, matches, api }) => {
      const mates = joinMateStats(
        await api.list(
          `/v1/players/${accountId}/mate-stats?min_matches_played=3`,
          mateStatsSchema.extend({ matches: z.array(z.number()) }),
        ),
        matches,
      ).slice(0, 50);
      const nameOf = await personaNames(mates.map((mate) => mate.mateId));
      return tabulate(mates, [
        ["name", "text", (mate) => nameOf(mate.mateId)],
        ["matches", "integer", (mate) => mate.matchesTogether],
        ["winrate", "percent", (mate) => mate.winrateTogether],
        ["winrateDelta", "signedPercent", (mate) => mate.winrateDelta],
        ["kda", "decimal", (mate) => mate.kdaTogether],
      ]);
    },
  }),
  playerPreset({
    id: "you.enemies",
    category: "squad",
    endpoint: "/v1/players/{account_id}/enemy-stats",
    ttl: STATS_TTL.mates,
    view: defaultView("table", {
      x: "name",
      y: ["matches", "winrate"],
      sortBy: "matches",
      limit: 10,
    }),
    size: { w: 6, h: 8 },
    load: async ({ accountId, api }) => {
      const enemies = (
        await api.list(
          `/v1/players/${accountId}/enemy-stats?min_matches_played=3`,
          enemySchema,
        )
      )
        .sort((a, b) => b.matches_played - a.matches_played)
        .slice(0, 50);
      const nameOf = await personaNames(enemies.map((enemy) => enemy.enemy_id));
      return tabulate(enemies, [
        ["name", "text", (enemy) => nameOf(enemy.enemy_id)],
        ["matches", "integer", (enemy) => enemy.matches_played],
        [
          "winrate",
          "percent",
          (enemy) => ratio(enemy.wins, enemy.matches_played),
        ],
      ]);
    },
  }),
  playerPreset({
    id: "you.rank",
    category: "ranked",
    endpoint: "/v1/players/{account_id}/rank",
    ttl: STATS_TTL.rank,
    view: defaultView("kpi", { y: ["badge"] }),
    size: { w: 3, h: 3 },
    load: async ({ accountId, api }) =>
      tabulate(
        [await api.one(`/v1/players/${accountId}/rank`, rankSchema)],
        [
          ["badge", "badge", (rank) => rank.badge],
          ["rank", "integer", (rank) => rank.rank],
          ["subrank", "integer", (rank) => rank.subrank],
        ],
      ),
  }),
];
