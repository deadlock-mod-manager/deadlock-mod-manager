import type {
  HeroCounterStats,
  MatchHistoryEntry,
  PlayerHeroStats,
} from "@/lib/stats/api";
import { isWin } from "@/lib/stats/derive";

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

export const isOneTrick = (record: LobbyRecord, heroId: number): boolean => {
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
