import type { SoulsPoint } from "@/hooks/use-live-match";
import type { MatchHistoryEntry, PerformanceCurvePoint } from "@/lib/stats/api";
import type { Grade } from "@/lib/stats/live-grades";
import type { LiveLobby } from "@/lib/stats/live-lobby";
import type { GamePhase } from "@/types/generated/GamePhase";
import type { LiveMatchStatus } from "@/types/generated/LiveMatchStatus";
import type { LiveScoreboardPlayer } from "@/types/generated/LiveScoreboardPlayer";

/**
 * Dev-only fixtures for the Live tab, so every state can be checked against the
 * designs without a running match. Picked from the dev toolbar on the tab and
 * remembered in localStorage.
 */

export const LIVE_MOCK_SCENARIOS = [
  "notInstalled",
  "closed",
  "queued",
  "pregame",
  "inMatch",
  "matchOver",
] as const;
export type LiveMockScenario = (typeof LIVE_MOCK_SCENARIOS)[number];

export const LIVE_MOCK_STORAGE_KEY = "dmm:live-mock";

export interface LiveMock {
  status: LiveMatchStatus;
  gameRunning: boolean;
  bridgeNeedsSetup: boolean;
  lobby: LiveLobby;
  curve: PerformanceCurvePoint[];
  trail: SoulsPoint[];
  queuedSince: number | null;
  matches: MatchHistoryEntry[];
  yourAccountId: number;
  yourBadge: number;
  result: "win" | "loss" | null;
  /** Overall grades the live board ended matches on, by match id. */
  finalGrades: Record<string, Grade>;
}

type Row = [
  name: string,
  hero: string,
  level: number,
  kills: number,
  deaths: number,
  assists: number,
  souls: number,
  objectiveDamage: number,
  dead?: boolean,
];

const FRIENDLY: Row[] = [
  ["Stormix", "Haze", 14, 7, 2, 5, 18_400, 4120],
  ["Zap", "Seven", 15, 6, 3, 6, 17_200, 6900],
  ["kiwi", "Infernus", 13, 4, 2, 9, 14_100, 3300],
  ["Tank", "Abrams", 13, 2, 4, 8, 12_900, 7400],
  ["mira", "Lady Geist", 12, 3, 5, 7, 11_300, 2100],
  ["Bolt", "Dynamo", 12, 2, 3, 11, 8400, 1800, true],
];

const ENEMY: Row[] = [
  ["Orb", "Vindicta", 14, 6, 3, 4, 16_900, 3900],
  ["Paper", "Paige", 12, 2, 5, 9, 11_800, 2600],
  ["hookz", "Bebop", 13, 3, 4, 10, 12_600, 5100, true],
  ["Nyx", "Mina", 12, 4, 6, 3, 10_900, 1700, true],
  ["leaf", "Ivy", 13, 1, 3, 12, 12_100, 2300],
  ["Sol", "Apollo", 14, 3, 3, 5, 11_800, 4400],
];

/** Lobby records, keyed by player name: overall and on the hero they play. */
const RECORDS = {
  Stormix: {
    overall: [1400, 742, 6],
    onHero: [212, 114, 6],
    badge: 65,
    form: "WWLWWLWWLW",
  },
  Zap: {
    overall: [612, 306, 3.4],
    onHero: [88, 45, 3.4],
    badge: 62,
    form: "LWLLWWLWLW",
  },
  kiwi: {
    overall: [2300, 1265, 4.1],
    onHero: [431, 246, 4.1],
    badge: 76,
    form: "WWLWWLWWWW",
  },
  Tank: {
    overall: [204, 96, 2.7],
    onHero: [39, 18, 2.7],
    badge: 61,
    form: "LLLWLWLWLL",
  },
  mira: { overall: [38, 17, 1.9], onHero: null, badge: null, form: "" },
  Bolt: {
    overall: [981, 500, 3.9],
    onHero: [156, 81, 3.9],
    badge: 33,
    form: "WLWLWWLLWW",
  },
  Orb: {
    overall: [1900, 1064, 4.8],
    onHero: [310, 180, 4.8],
    badge: 52,
    form: "WWLWWWLWWL",
  },
  Paper: {
    overall: [340, 167, 3.6],
    onHero: [64, 31, 3.6],
    badge: 64,
    form: "LWWLWLLWWL",
  },
  hookz: {
    overall: [880, 475, 3.1],
    onHero: [522, 287, 3.1],
    badge: 66,
    form: "WLWWLWWWLW",
  },
  Nyx: {
    overall: [150, 66, 2.9],
    onHero: [41, 18, 2.9],
    badge: 63,
    form: "LLWLWLLWLL",
  },
  leaf: {
    overall: [420, 223, 3.8],
    onHero: [120, 64, 3.8],
    badge: 46,
    form: "WWLWLWWLWW",
  },
  Sol: {
    overall: [96, 40, 2.2],
    onHero: [17, 7, 2.2],
    badge: 62,
    form: "LWLLWLLWLL",
  },
} satisfies Record<
  string,
  {
    overall: [number, number, number];
    onHero: [number, number, number] | null;
    badge: number | null;
    form: string;
  }
>;

const ACCOUNT_BASE = 900_000;
const accountOf = (name: string) =>
  ACCOUNT_BASE + Object.keys(RECORDS).indexOf(name);

const NOW_MINUTES = 18;

/** Souls by minute for the bracket, and for a player pulling ahead of it. */
const bracketSouls = (minutes: number) => 620 * minutes + 15 * minutes ** 2;
const yourSouls = (minutes: number) =>
  bracketSouls(minutes) * (0.9 + 0.0138 * minutes);

const curve: PerformanceCurvePoint[] = Array.from({ length: 40 }, (_, i) => {
  const minutes = i + 1;
  const souls = bracketSouls(minutes);
  return {
    game_time: minutes * 60,
    net_worth_avg: souls,
    net_worth_std: souls * 0.15 + 300,
    kills_avg: minutes * 0.228,
    kills_std: minutes * 0.09 + 0.5,
    deaths_avg: minutes * 0.189,
    deaths_std: minutes * 0.07 + 0.5,
    assists_avg: minutes * 0.4,
    assists_std: minutes * 0.2 + 0.5,
    boss_damage_avg: minutes * 249,
    boss_damage_std: minutes * 140,
    samples: 9000,
  };
});

const trail: SoulsPoint[] = Array.from({ length: 36 }, (_, i) => ({
  minutes: i / 2,
  souls: Math.round(yourSouls(i / 2)),
})).concat({ minutes: NOW_MINUTES, souls: 18_400 });

const toPlayer = (
  [name, heroName, level, kills, deaths, assists, souls, objective, dead]: Row,
  hidden: boolean,
): LiveScoreboardPlayer => ({
  name,
  accountId: name in RECORDS ? accountOf(name) : null,
  heroId: null,
  heroName,
  level: hidden ? null : level,
  kills: hidden ? null : kills,
  deaths: hidden ? null : deaths,
  assists: hidden ? null : assists,
  souls: hidden ? null : souls,
  objectiveDamage: hidden ? null : objective,
  isLocal: name === "Stormix",
  isDead: !hidden && !!dead,
});

const MATCH_ID = "38201445";

/** Where each scenario's match is; the rest have no lobby. */
const LOBBY_PHASES = {
  notInstalled: null,
  closed: null,
  queued: null,
  pregame: "pregame",
  inMatch: "inProgress",
  matchOver: "ended",
} satisfies Record<LiveMockScenario, GamePhase | null>;

const hoursAgo = (hours: number) =>
  Math.floor(Date.now() / 1000 - hours * 3600);

const match = (
  heroId: number,
  won: boolean,
  startedHoursAgo: number,
  [kills, deaths, assists, souls]: [number, number, number, number],
): MatchHistoryEntry => ({
  account_id: accountOf("Stormix"),
  match_id: 38_201_000 + Math.round(startedHoursAgo * 10),
  hero_id: heroId,
  hero_level: 30,
  start_time: hoursAgo(startedHoursAgo),
  game_mode: 1,
  match_mode: 4,
  player_team: 0,
  match_result: won ? 0 : 1,
  player_kills: kills,
  player_deaths: deaths,
  player_assists: assists,
  denies: 12,
  net_worth: souls,
  last_hits: 240,
  match_duration_s: 31 * 60 + 4,
  team_abandoned: null,
  abandoned_time_s: null,
  objectives_mask_team0: 0,
  objectives_mask_team1: 0,
  ranked_display_badge: 105,
  ranked_delta: null,
  ranked_calibration_match: null,
});

/**
 * Builds one scenario. Hero ids come from the live catalog, since the fixtures
 * only know heroes by the names the top bar prints.
 */
export const buildLiveMock = (
  scenario: LiveMockScenario,
  heroIdOf: (name: string) => number | undefined,
): LiveMock => {
  const heroId = (name: string) => heroIdOf(name) ?? 0;
  const pregame = scenario === "pregame";
  const board = {
    clockSeconds: pregame ? null : NOW_MINUTES * 60,
    friendly: FRIENDLY.map((row) => toPlayer(row, pregame)),
    enemy: ENEMY.map((row) => toPlayer(row, pregame)),
    team: "hiddenKing" as const,
    reportedAt: Date.now() - 2000,
  };
  const heroOfName = new Map(
    [...FRIENDLY, ...ENEMY].map(([name, hero]) => [name, heroId(hero)]),
  );
  const lastMatch = match(heroId("Haze"), true, 0.62, [11, 2, 9, 38_200]);
  const phase = LOBBY_PHASES[scenario];

  return {
    status: {
      consoleLogAvailable: true,
      queued: scenario === "queued",
      current: phase ? { matchId: MATCH_ID, lobbyId: "1", phase } : null,
      recentMatchIds: [],
      scoreboard: phase ? board : null,
    },
    gameRunning: scenario !== "closed" && scenario !== "notInstalled",
    bridgeNeedsSetup: scenario === "notInstalled",
    lobby: {
      records: new Map(
        Object.entries(RECORDS).map(([name, record]) => {
          const [matches, wins, kda] = record.overall;
          const hero = heroOfName.get(name) ?? 0;
          return [
            accountOf(name),
            {
              overall: { matches, wins, kda },
              heroes: new Map(
                record.onHero
                  ? [
                      [
                        hero,
                        {
                          matches: record.onHero[0],
                          wins: record.onHero[1],
                          kda: record.onHero[2],
                        },
                      ],
                    ]
                  : [],
              ),
            },
          ];
        }),
      ),
      ranks: new Map(
        Object.entries(RECORDS).flatMap(([name, record]) =>
          record.badge === null ? [] : [[accountOf(name), record.badge]],
        ),
      ),
      form: new Map(
        Object.entries(RECORDS).flatMap(([name, record]) =>
          record.form
            ? [[accountOf(name), [...record.form].map((r) => r === "W")]]
            : [],
        ),
      ),
      mates: new Map([
        [accountOf("Zap"), { matches: 6, wins: 4 }],
        [accountOf("leaf"), { matches: 2, wins: 1 }],
      ]),
      enemies: new Map([
        [accountOf("Orb"), { matches: 4, wins: 1 }],
        [accountOf("Sol"), { matches: 5, wins: 3 }],
      ]),
      matchups: new Map([
        [heroId("Vindicta"), { matches: 22, wins: 8 }],
        [heroId("Paige"), { matches: 9, wins: 5 }],
        [heroId("Bebop"), { matches: 31, wins: 19 }],
        [heroId("Mina"), { matches: 4, wins: 2 }],
        [heroId("Ivy"), { matches: 18, wins: 9 }],
        [heroId("Apollo"), { matches: 12, wins: 8 }],
      ]),
      isPending: false,
    },
    curve,
    trail: scenario === "inMatch" || scenario === "matchOver" ? trail : [],
    queuedSince: scenario === "queued" ? Date.now() - 102_000 : null,
    matches: [
      lastMatch,
      match(heroId("Haze"), false, 1, [5, 7, 8, 26_100]),
      match(heroId("Seven"), true, 1.7, [8, 4, 12, 31_400]),
      match(heroId("Haze"), true, 2.4, [9, 3, 6, 33_000]),
    ],
    yourAccountId: accountOf("Stormix"),
    yourBadge: 65,
    result: scenario === "matchOver" ? "win" : null,
    finalGrades: { [String(lastMatch.match_id)]: "S" },
  };
};
