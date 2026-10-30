import type {
  HeroCounterStats,
  MatchHistoryEntry,
  PlayerHeroStats,
} from "@/lib/stats/api";
import { isWin } from "@/lib/stats/derive";
import type { ResolvedPlayer } from "@/lib/stats/live-teams";

export interface WinRecord {
  matches: number;
  wins: number;
}

export interface CareerRecord extends WinRecord {
  kda: number;
}

/** One lobby player's record, overall and split by hero. */
export interface LobbyRecord {
  overall: CareerRecord;
  heroes: Map<number, CareerRecord>;
}

/** Everything known about the lobby beyond what the top bar shows. */
export interface LiveLobby {
  records: Map<number, LobbyRecord>;
  ranks: Map<number, number>;
  /** Recent results per account, newest first; `true` is a win. */
  form: Map<number, boolean[]>;
  /** Your record with each teammate and against each opponent, by account. */
  mates: Map<number, WinRecord>;
  enemies: Map<number, WinRecord>;
  /** Your record on your current hero against each enemy hero, by hero id. */
  matchups: Map<number, WinRecord>;
  isPending: boolean;
}

export const FORM_LENGTH = 10;

/** A hero this share of someone's matches is the one they main. */
const ONE_TRICK_SHARE = 0.5;
/** Below this many matches a share says nothing. */
const ONE_TRICK_MIN_MATCHES = 30;
/** Streaks shorter than this are noise, not a tag. */
const MIN_STREAK = 3;
/** Fewer games than this against a hero says nothing about the matchup. */
const MIN_MATCHUP_GAMES = 5;
/** Below this win rate a matchup is a hard one. */
const HARD_MATCHUP = 0.45;
/** From this win rate a matchup reads as going your way. */
const WINNING_MATCHUP = 0.55;
/** From this win rate a matchup is one of your best. */
const GOOD_MATCHUP = 0.6;

export const winrateOf = (record: WinRecord): number =>
  record.wins / Math.max(record.matches, 1);

const poolRecords = (records: WinRecord[]): WinRecord =>
  records.reduce(
    (sum, record) => ({
      matches: sum.matches + record.matches,
      wins: sum.wins + record.wins,
    }),
    { matches: 0, wins: 0 },
  );

const career = (
  matches: number,
  wins: number,
  kills: number,
  deaths: number,
  assists: number,
): CareerRecord => ({
  matches,
  wins,
  kda: (kills + assists) / Math.max(deaths, 1),
});

export const lobbyRecords = (
  rows: PlayerHeroStats[],
): Map<number, LobbyRecord> => {
  const byAccount = new Map<number, PlayerHeroStats[]>();
  for (const row of rows) {
    if (row.matches_played === 0) continue;
    byAccount.set(row.account_id, [
      ...(byAccount.get(row.account_id) ?? []),
      row,
    ]);
  }

  const records = new Map<number, LobbyRecord>();
  for (const [accountId, heroes] of byAccount) {
    const total = heroes.reduce(
      (sum, hero) => ({
        matches: sum.matches + hero.matches_played,
        wins: sum.wins + hero.wins,
        kills: sum.kills + hero.kills,
        deaths: sum.deaths + hero.deaths,
        assists: sum.assists + hero.assists,
      }),
      { matches: 0, wins: 0, kills: 0, deaths: 0, assists: 0 },
    );
    records.set(accountId, {
      overall: career(
        total.matches,
        total.wins,
        total.kills,
        total.deaths,
        total.assists,
      ),
      heroes: new Map(
        heroes.map((hero) => [
          hero.hero_id,
          career(
            hero.matches_played,
            hero.wins,
            hero.kills,
            hero.deaths,
            hero.assists,
          ),
        ]),
      ),
    });
  }
  return records;
};

export const recentForm = (history: MatchHistoryEntry[]): boolean[] =>
  [...history]
    .sort((a, b) => b.start_time - a.start_time)
    .slice(0, FORM_LENGTH)
    .map(isWin);

/** The run the player is on, when it is long enough to mention. */
export const streakOf = (
  form: boolean[],
): { won: boolean; length: number } | null => {
  const [latest] = form;
  if (latest === undefined) return null;
  const length = form.findIndex((won) => won !== latest);
  const run = length === -1 ? form.length : length;
  return run >= MIN_STREAK ? { won: latest, length: run } : null;
};

const isOneTrick = (record: LobbyRecord, heroId: number): boolean => {
  const onHero = record.heroes.get(heroId);
  return (
    !!onHero &&
    record.overall.matches >= ONE_TRICK_MIN_MATCHES &&
    onHero.matches / record.overall.matches >= ONE_TRICK_SHARE
  );
};

export const matchupsFor = (
  rows: HeroCounterStats[],
  heroId: number,
): Map<number, WinRecord> =>
  new Map(
    rows
      .filter((row) => row.hero_id === heroId)
      .map((row) => [
        row.enemy_hero_id,
        { matches: row.matches_played, wins: row.wins },
      ]),
  );

const SUBRANKS = 6;

/**
 * The badge in the middle of a group. Badges are `tier * 10 + subrank` with
 * subranks 1-6, so they are averaged on a scale without the gaps.
 */
export const averageBadge = (badges: number[]): number | null => {
  const steps = badges
    .filter((badge) => badge > 0)
    .map(
      (badge) =>
        Math.floor(badge / 10) * SUBRANKS + Math.max((badge % 10) - 1, 0),
    );
  if (steps.length === 0) return null;
  const step = Math.round(
    steps.reduce((sum, value) => sum + value, 0) / steps.length,
  );
  return Math.floor(step / SUBRANKS) * 10 + (step % SUBRANKS) + 1;
};

/** What the lobby knows about one player. */
export interface LobbyEntry {
  record: LobbyRecord | undefined;
  /** Their record on the hero they are playing now. */
  onHero: CareerRecord | undefined;
  badge: number | undefined;
  form: boolean[] | undefined;
}

export const lobbyEntryOf = (
  lobby: LiveLobby,
  { player, hero }: ResolvedPlayer,
): LobbyEntry => {
  const id = player.accountId;
  if (id === null) {
    return {
      record: undefined,
      onHero: undefined,
      badge: undefined,
      form: undefined,
    };
  }
  const record = lobby.records.get(id);
  return {
    record,
    onHero: hero ? record?.heroes.get(hero.id) : undefined,
    badge: lobby.ranks.get(id),
    form: lobby.form.get(id),
  };
};

const mean = (values: number[]) =>
  values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;

/** One team's numbers for the scouting report's side-by-side. */
export interface TeamScouting {
  rank: number | null;
  /** Average games each player has on the hero they locked. */
  onHero: number | null;
  /** Pooled win rate on the heroes they locked. */
  winrate: number | null;
  matches: number;
}

export const teamScouting = (
  lobby: LiveLobby,
  team: ResolvedPlayer[],
): TeamScouting => {
  const entries = team.map((player) => lobbyEntryOf(lobby, player));
  const onHero = entries.flatMap((entry) => entry.onHero ?? []);
  const pooled = poolRecords(onHero);
  return {
    rank: averageBadge(entries.flatMap((entry) => entry.badge ?? [])),
    onHero: mean(onHero.map((record) => record.matches)),
    winrate: pooled.matches > 0 ? winrateOf(pooled) : null,
    matches: entries.reduce(
      (sum, entry) => sum + (entry.record?.overall.matches ?? 0),
      0,
    ),
  };
};

/** A note next to a player's name in the scouting report. */
export type ScoutingTag =
  | { kind: "beatYou"; lost: number; count: number }
  | { kind: "againstYou"; count: number }
  | { kind: "withYou"; count: number }
  | { kind: "noRecord" }
  | { kind: "firstGame" }
  | { kind: "oneTrick" }
  | { kind: "streak"; won: boolean; length: number };

export const scoutingTags = (
  lobby: LiveLobby,
  resolved: ResolvedPlayer,
  isEnemy: boolean,
): ScoutingTag[] => {
  const { player, hero } = resolved;
  const { record, onHero, form } = lobbyEntryOf(lobby, resolved);
  const tags: ScoutingTag[] = [];
  const met =
    player.accountId === null || player.isLocal
      ? undefined
      : (isEnemy ? lobby.enemies : lobby.mates).get(player.accountId);
  if (met && isEnemy) {
    const lost = met.matches - met.wins;
    tags.push(
      lost > met.wins
        ? { kind: "beatYou", lost, count: met.matches }
        : { kind: "againstYou", count: met.matches },
    );
  } else if (met) {
    tags.push({ kind: "withYou", count: met.matches });
  }
  if (!record) {
    if (!player.isLocal) tags.push({ kind: "noRecord" });
    return tags;
  }
  if (hero && !onHero) {
    tags.push({ kind: "firstGame" });
  } else if (hero && isOneTrick(record, hero.id)) {
    tags.push({ kind: "oneTrick" });
  }
  const streak = streakOf(form ?? []);
  if (streak) tags.push({ kind: "streak", ...streak });
  return tags;
};

export type MatchupTone = "good" | "even" | "bad" | "unknown";

export interface Matchup<Hero extends { id: number }> {
  hero: Hero;
  record: WinRecord;
  /** `null` until there are enough games to say anything. */
  winrate: number | null;
  tone: MatchupTone;
  note: "hardest" | "best" | null;
}

export interface MatchupReport<Hero extends { id: number }> {
  matchups: Matchup<Hero>[];
  /** All the matchups' games together. */
  pooled: WinRecord;
}

/** Your record on your hero against each enemy hero, and across all of them. */
export const matchupReport = <Hero extends { id: number }>(
  records: Map<number, WinRecord>,
  enemyHeroes: Hero[],
): MatchupReport<Hero> => {
  const rows = enemyHeroes.map((hero) => {
    const record = records.get(hero.id) ?? { matches: 0, wins: 0 };
    return {
      hero,
      record,
      winrate: record.matches >= MIN_MATCHUP_GAMES ? winrateOf(record) : null,
    };
  });
  const hardest = rows
    .filter((row) => row.winrate !== null)
    .sort((a, b) => (a.winrate ?? 0) - (b.winrate ?? 0))[0];
  const toneOf = (winrate: number | null): MatchupTone =>
    winrate === null
      ? "unknown"
      : winrate >= WINNING_MATCHUP
        ? "good"
        : winrate < HARD_MATCHUP
          ? "bad"
          : "even";
  const matchups = rows.map(
    ({ hero, record, winrate }): Matchup<Hero> => ({
      hero,
      record,
      winrate,
      tone: toneOf(winrate),
      note:
        winrate === null
          ? null
          : hero.id === hardest?.hero.id && winrate < HARD_MATCHUP
            ? "hardest"
            : winrate >= GOOD_MATCHUP
              ? "best"
              : null,
    }),
  );
  return {
    matchups,
    pooled: poolRecords(rows.map((row) => row.record)),
  };
};
