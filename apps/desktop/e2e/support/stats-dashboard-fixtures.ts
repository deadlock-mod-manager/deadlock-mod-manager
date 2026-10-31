import { writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { FixtureRequest, FixtureRoute } from "./fixture-server";
import { readPersistedDocument } from "./observations";
import type { CreatedWorld } from "./world";

/**
 * deadlock-api as the Stats dashboard sees it: one pinned account, a twenty
 * match history, two heroes and every global endpoint the presets and tab
 * templates read. Shapes mirror the live API (the stats-dashboard-endpoints
 * skill keeps them in step); values are small and exact so the specs can
 * assert what the widgets compute, not just that they render.
 *
 * The history alternates wins and losses, with every third match on Seven:
 *   Infernus 13 matches, 6 wins (46%), KDA (84 + 104) / 52 = 3.62
 *   Seven     7 matches, 4 wins (57%), KDA (46 + 56) / 28 = 3.64
 */

const STATS_ACCOUNT_ID = 1001;
const HOUR_S = 60 * 60;
const INFERNUS = 1;
const SEVEN = 2;
const ITEM_ID = 7409189;

const json = <T>(body: T) => JSON.stringify(body);

const matchHistory = () => {
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: 20 }, (_, index) => ({
    account_id: STATS_ACCOUNT_ID,
    match_id: 5_000 + index,
    hero_id: index % 3 === 0 ? SEVEN : INFERNUS,
    hero_level: 30,
    start_time: now - (index + 1) * 2 * HOUR_S,
    game_mode: 1,
    match_mode: 1,
    player_team: 0,
    // Team 0 wins every even match.
    match_result: index % 2,
    player_kills: 5 + (index % 4),
    player_deaths: 4,
    player_assists: 8,
    denies: 3,
    net_worth: 32_000,
    last_hits: 140,
    match_duration_s: 1_900,
    team_abandoned: false,
    abandoned_time_s: null,
    objectives_mask_team0: 0,
    objectives_mask_team1: 0,
    ranked_display_badge: null,
    ranked_delta: null,
    ranked_calibration_match: null,
  }));
};

const heroes = [
  { id: INFERNUS, name: "Infernus", class_name: "hero_inferno", images: {} },
  { id: SEVEN, name: "Seven", class_name: "hero_gigawatt", images: {} },
];

const globalHeroStats = [INFERNUS, SEVEN].map((heroId) => ({
  hero_id: heroId,
  bucket: 0,
  wins: 520 - heroId * 20,
  losses: 480 + heroId * 20,
  matches: 1_000,
  matches_per_bucket: 1_000,
  total_kills: 7_000,
  total_deaths: 6_900,
  total_assists: 13_000,
  total_net_worth: 44_000_000,
  total_last_hits: 150_000,
  total_denies: 5_000,
  total_player_damage: 33_000_000,
  total_player_damage_taken: 40_000_000,
  total_boss_damage: 5_000_000,
  total_shots_hit: 60_000,
  total_shots_missed: 40_000,
}));

/** How the "Hero bans" table renders the fixture, highest first. */
export const HERO_BAN_ROWS = [
  ["Infernus", "4,900"],
  ["Seven", "2,100"],
] as const;
const bans = [
  { hero_id: INFERNUS, bucket: 0, bans: 4_900 },
  { hero_id: SEVEN, bucket: 0, bans: 2_100 },
];

const itemStats = [
  {
    item_id: ITEM_ID,
    bucket: 0,
    wins: 5_100,
    losses: 4_900,
    matches: 10_000,
    players: 9_000,
    avg_buy_time_s: 820,
    avg_sell_time_s: 1_770,
    avg_buy_time_relative: 36,
    avg_sell_time_relative: 80,
    sold: 400,
  },
];

const dayStart = (daysAgo: number) =>
  (Math.floor(Date.now() / 1000 / 86_400) - daysAgo) * 86_400;

const gameStats = [2, 1].map((daysAgo) => ({
  bucket: dayStart(daysAgo),
  total_matches: 40_000 + daysAgo,
  total_players: 230_000,
  avg_duration_s: 2_290,
  avg_kills: 6.8,
  avg_deaths: 6.9,
  avg_assists: 13.4,
  avg_net_worth: 44_000,
  avg_player_damage: 33_000,
  mid_boss_kill_rate: 0.8,
  abandon_rate: 0.02,
}));

const baseRoutes = (): FixtureRoute[] => [
  {
    method: "GET",
    path: "/v1/assets/heroes",
    query: { only_active: "true" },
    status: 200,
    body: json(heroes),
  },
  {
    method: "GET",
    path: "/v1/assets/items",
    query: { only_active: "true" },
    status: 200,
    body: json([
      { id: ITEM_ID, name: "Extra Charge", type: "upgrade", item_tier: 1 },
    ]),
  },
  { method: "GET", path: "/v1/assets/ranks", status: 200, body: "[]" },
  { method: "GET", path: "/v1/assets/ranked-seasons", status: 200, body: "[]" },
  {
    method: "GET",
    path: "/v1/analytics/badge-distribution",
    status: 200,
    body: "[]",
  },
  {
    method: "GET",
    path: "/v1/analytics/player-stats/metrics",
    status: 200,
    body: "{}",
  },
  {
    method: "GET",
    path: `/v1/players/${STATS_ACCOUNT_ID}/match-history`,
    status: 200,
    body: json(matchHistory()),
  },
  { method: "GET", path: "/v1/players/hero-stats", status: 200, body: "[]" },
  // The Squad section: no mates or enemies with three shared matches yet.
  {
    method: "GET",
    path: `/v1/players/${STATS_ACCOUNT_ID}/mate-stats`,
    status: 200,
    body: "[]",
  },
  {
    method: "GET",
    path: `/v1/players/${STATS_ACCOUNT_ID}/enemy-stats`,
    status: 200,
    body: "[]",
  },
  {
    method: "GET",
    path: `/v1/players/${STATS_ACCOUNT_ID}/rank`,
    status: 200,
    body: json({ badge: 0, rank: 0, subrank: 0, last_match: null }),
  },
  {
    method: "GET",
    path: "/v1/players/steam",
    status: 200,
    body: json([
      {
        account_id: STATS_ACCOUNT_ID,
        personaname: "E2E Player",
        profileurl: "",
        avatar: "",
        avatarmedium: "",
        avatarfull: "",
        realname: null,
        countrycode: null,
        last_updated: "",
        matches_played_last_30d: 20,
      },
    ]),
  },
  // The Heroes panel's benchmark and the "Hero meta" preset alike.
  {
    method: "GET",
    path: "/v1/analytics/hero-stats",
    status: 200,
    body: json(globalHeroStats),
  },
  {
    method: "GET",
    path: "/v1/analytics/hero-ban-stats",
    status: 200,
    body: json(bans),
  },
  {
    method: "GET",
    path: "/v1/analytics/hero-comb-stats",
    status: 200,
    body: json([
      { hero_ids: [INFERNUS, SEVEN], wins: 640, losses: 360, matches: 1_000 },
    ]),
  },
  {
    method: "GET",
    path: "/v1/analytics/game-stats",
    status: 200,
    body: json(gameStats),
  },
  {
    method: "GET",
    path: "/v1/analytics/item-stats",
    status: 200,
    body: json(itemStats),
  },
];

/**
 * How deadlock-api actually breaks: an endpoint that 404s once and then
 * recovers, and one whose field got renamed. Listed first, so they shadow the
 * healthy versions in `baseRoutes`.
 */
const brokenRoutes = (): FixtureRoute[] => [
  {
    method: "GET",
    path: "/v1/analytics/item-stats",
    status: 404,
    body: json({ error: "Not Found" }),
    sequence: [
      { status: 404, body: json({ error: "Not Found" }) },
      { status: 200, body: json(itemStats) },
    ],
  },
  {
    method: "GET",
    path: "/v1/analytics/hero-ban-stats",
    status: 200,
    body: json(
      bans.map(({ hero_id, bucket, bans: banned }) => ({
        hero_id,
        bucket,
        banned,
      })),
    ),
  },
];

export const statsDashboardRoutes = async (id: string) => () =>
  id === "stats-broken-endpoints"
    ? [...brokenRoutes(), ...baseRoutes()]
    : baseRoutes();

type SeededView = { chart: string; x?: string; y: string[] };

const presetWidget = (id: string, preset: string, view: SeededView) => ({
  id,
  title: "",
  w: 6,
  h: 7,
  source: { kind: "preset", preset, params: {} },
  view,
});

const builtInTab = (id: string, icon: string, panels: string[]) => ({
  id,
  title: null,
  icon,
  widgets: panels.map((panel) => ({
    id: `${id}-${panel}`,
    title: "",
    w: 12,
    h: null,
    source: { kind: "panel", panel },
  })),
});

/**
 * A layout as an earlier session left it: one tab whose widgets each meet a
 * different breakage. Seeding it skips the editor, so the first request each
 * widget makes is the one the spec observes.
 */
const brokenLayout = {
  version: 1,
  tabs: [
    builtInTab("overview", "chart", ["tiles"]),
    builtInTab("live", "radio", ["liveScoreboard"]),
    {
      id: "tab-health",
      title: "Health",
      icon: "flame",
      widgets: [
        presetWidget("widget-recovering", "global.items", {
          chart: "table",
          x: "itemId",
          y: ["winrate"],
        }),
        presetWidget("widget-renamed-field", "global.bans", {
          chart: "barHorizontal",
          x: "heroId",
          y: ["bans"],
        }),
        presetWidget("widget-missing-field", "global.heroes", {
          chart: "bar",
          x: "heroId",
          y: ["contestRate"],
        }),
        presetWidget("widget-removed-preset", "global.retired", {
          chart: "kpi",
          y: ["value"],
        }),
        presetWidget("widget-healthy", "global.duos", {
          chart: "table",
          x: "heroes",
          y: ["winrate"],
        }),
      ],
    },
  ],
};

/** Pins the account so the page never depends on Steam being installed. */
export const prepareStatsDashboardWorld = async (world: CreatedWorld) => {
  const persisted = z
    .object({ state: z.record(z.string(), z.json()), version: z.number() })
    .parse(await readPersistedDocument(world.directory));
  const features = z
    .record(z.string(), z.boolean())
    .catch({})
    .parse(persisted.state.experimentalFeatures);
  await writeFile(
    path.join(world.configuration.roots.appData, "state.json"),
    json({
      "local-config": json({
        ...persisted,
        state: {
          ...persisted.state,
          experimentalFeatures: {
            ...features,
            "player-stats": true,
            "live-scoreboard": true,
          },
          statsAccountId: STATS_ACCOUNT_ID,
          statsDashboard:
            world.configuration.caseId === "stats-broken-endpoints"
              ? brokenLayout
              : null,
        },
      }),
    }),
  );
};

const answered = (
  requests: readonly FixtureRequest[],
  pathname: string,
  status: number,
) =>
  requests.filter(
    (request) =>
      request.url.includes(pathname) && request.responseStatus === status,
  ).length;

export const assertStatsDashboardNetwork = (
  id: string,
  requests: readonly FixtureRequest[],
): void => {
  if (
    answered(requests, `/v1/players/${STATS_ACCOUNT_ID}/match-history`, 200) ===
    0
  )
    throw new Error("The pinned account's match history was never loaded");
  if (id === "stats-broken-endpoints") {
    if (answered(requests, "/v1/analytics/item-stats", 404) !== 1)
      throw new Error("The recovering widget must fail exactly once");
    if (answered(requests, "/v1/analytics/item-stats", 200) !== 1)
      throw new Error("Retry must refetch the failed endpoint exactly once");
  }
  if (id === "stats-custom-queries") {
    const query = requests.find((request) =>
      request.url.includes("/v1/analytics/hero-ban-stats"),
    );
    if (!query || !/min_unix_timestamp=\d{9,}/.test(query.url))
      throw new Error(
        `The {since_30d} placeholder was not resolved: ${query?.url ?? "no request"}`,
      );
  }
};
