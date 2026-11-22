import type {
  AnalyticsHeroStats,
  ItemStats,
  MatchHistoryEntry,
  MateStats,
  PlayerHeroStats,
} from "@/lib/stats/api";
import { badgeToStep } from "@/lib/stats/rank";

export const isUnscored = (
  match: Pick<MatchHistoryEntry, "player_match_outcome">,
): boolean => match.player_match_outcome === 5;

export type MatchOutcome = "win" | "loss" | "notScored";
export type MatchStatus = MatchOutcome | "abandoned";

export const matchOutcome = (
  match: Pick<
    MatchHistoryEntry,
    "player_match_outcome" | "match_result" | "player_team"
  >,
): MatchOutcome =>
  isUnscored(match)
    ? "notScored"
    : match.match_result === match.player_team
      ? "win"
      : "loss";

export const isWin = (match: MatchHistoryEntry): boolean =>
  matchOutcome(match) === "win";

export const matchStatus = (match: MatchHistoryEntry): MatchStatus =>
  (match.abandoned_time_s ?? 0) > 0 ? "abandoned" : matchOutcome(match);

export const chronological = (
  matches: MatchHistoryEntry[],
): MatchHistoryEntry[] =>
  [...matches].sort((a, b) => a.start_time - b.start_time);

export const mergeLocalMatches = (
  api: MatchHistoryEntry[],
  local: MatchHistoryEntry[],
): MatchHistoryEntry[] => {
  const notScored = new Set(local.filter(isUnscored).map((m) => m.match_id));
  const merged =
    notScored.size === 0
      ? api
      : api.map((match) =>
          notScored.has(match.match_id)
            ? {
                ...match,
                player_match_outcome: match.player_match_outcome ?? 5,
              }
            : match,
        );
  const extra = localOnlyMatches(api, local);
  return extra.length === 0 ? merged : [...extra, ...merged];
};

export const localOnlyMatches = (
  api: MatchHistoryEntry[],
  local: MatchHistoryEntry[],
): MatchHistoryEntry[] => {
  if (local.length === 0) {
    return [];
  }
  const known = new Set(api.map((match) => match.match_id));
  return local.filter((match) => !known.has(match.match_id));
};

export const mergeHeroStats = (
  heroStats: PlayerHeroStats[],
  extraMatches: MatchHistoryEntry[],
): PlayerHeroStats[] => {
  const scoredMatches = extraMatches.filter((match) => !isUnscored(match));
  if (scoredMatches.length === 0) {
    return heroStats;
  }

  const byHero = new Map(heroStats.map((hero) => [hero.hero_id, { ...hero }]));

  for (const match of scoredMatches) {
    const existing = byHero.get(match.hero_id);
    const hero: PlayerHeroStats = existing ?? {
      ...EMPTY_HERO_STATS,
      account_id: match.account_id,
      hero_id: match.hero_id,
    };

    hero.matches_played += 1;
    hero.wins += isWin(match) ? 1 : 0;
    hero.kills += match.player_kills;
    hero.deaths += match.player_deaths;
    hero.assists += match.player_assists;
    hero.time_played += match.match_duration_s;
    hero.last_played = Math.max(hero.last_played, match.start_time);
    byHero.set(match.hero_id, hero);
  }

  return [...byHero.values()];
};

const EMPTY_HERO_STATS: PlayerHeroStats = {
  account_id: 0,
  hero_id: 0,
  matches_played: 0,
  wins: 0,
  last_played: 0,
  time_played: 0,
  kills: 0,
  deaths: 0,
  assists: 0,
  ending_level: 0,
  accuracy: 0,
  crit_shot_rate: 0,
  denies_per_match: 0,
  kills_per_min: 0,
  deaths_per_min: 0,
  assists_per_min: 0,
  denies_per_min: 0,
  networth_per_min: 0,
  last_hits_per_min: 0,
  damage_per_min: 0,
  damage_taken_per_min: 0,
  damage_mitigated_per_min: 0,
  obj_damage_per_min: 0,
  total_player_damage: 0,
  total_player_damage_taken: 0,
  total_boss_damage: 0,
  total_creep_damage: 0,
  total_neutral_damage: 0,
};

export interface StatsSummary {
  matches: number;
  wins: number;
  losses: number;
  winrate: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  soulsPerMin: number;
  lastHitsPerMin: number;
  avgDurationMin: number;
}

const EMPTY_SUMMARY: StatsSummary = {
  matches: 0,
  wins: 0,
  losses: 0,
  winrate: 0,
  kills: 0,
  deaths: 0,
  assists: 0,
  kda: 0,
  soulsPerMin: 0,
  lastHitsPerMin: 0,
  avgDurationMin: 0,
};

export const summarize = (matches: MatchHistoryEntry[]): StatsSummary => {
  if (matches.length === 0) {
    return EMPTY_SUMMARY;
  }

  let wins = 0;
  let losses = 0;
  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let netWorth = 0;
  let lastHits = 0;
  let durationS = 0;

  for (const match of matches) {
    const outcome = matchOutcome(match);
    if (outcome === "win") wins++;
    if (outcome === "loss") losses++;
    kills += match.player_kills;
    deaths += match.player_deaths;
    assists += match.player_assists;
    netWorth += match.net_worth;
    lastHits += match.last_hits;
    durationS += match.match_duration_s;
  }

  const minutes = durationS / 60;
  return {
    matches: matches.length,
    wins,
    losses,
    winrate: wins / Math.max(wins + losses, 1),
    kills: kills / matches.length,
    deaths: deaths / matches.length,
    assists: assists / matches.length,
    kda: (kills + assists) / Math.max(deaths, 1),
    soulsPerMin: minutes > 0 ? netWorth / minutes : 0,
    lastHitsPerMin: minutes > 0 ? lastHits / minutes : 0,
    avgDurationMin: minutes / matches.length,
  };
};

export interface RollingPoint {
  matchId: number;
  startTime: number;
  winrate: number | null;
  kda: number;
}

export const rollingWinrate = (
  matches: MatchHistoryEntry[],
  window = 20,
): RollingPoint[] => {
  const ordered = chronological(matches.filter((match) => !isUnscored(match)));
  return ordered.map((match, index) => {
    const slice = ordered.slice(Math.max(0, index - window + 1), index + 1);
    const summary = summarize(slice);
    return {
      matchId: match.match_id,
      startTime: match.start_time,
      winrate: slice.length >= window ? summary.winrate : null,
      kda: summary.kda,
    };
  });
};

export interface FormPoint {
  startTime: number;
  winrate: number;
}

export const formCurve = (
  matches: MatchHistoryEntry[],
  window: number,
): FormPoint[] =>
  rollingWinrate(matches, window).flatMap((point) =>
    point.winrate === null
      ? []
      : [{ startTime: point.startTime, winrate: point.winrate * 100 }],
  );

export interface StreakInfo {
  current: number;
  longestWin: number;
  longestLoss: number;
}

export const streaks = (matches: MatchHistoryEntry[]): StreakInfo => {
  const ordered = chronological(matches.filter((match) => !isUnscored(match)));
  let current = 0;
  let longestWin = 0;
  let longestLoss = 0;

  for (const match of ordered) {
    const won = isWin(match);
    current = won ? Math.max(current, 0) + 1 : Math.min(current, 0) - 1;
    longestWin = Math.max(longestWin, current);
    longestLoss = Math.max(longestLoss, -current);
  }

  return { current, longestWin, longestLoss };
};

export interface BucketStats {
  bucket: number;
  matches: number;
  wins: number;
  winrate: number;
}

const bucketize = (
  matches: MatchHistoryEntry[],
  bucketOf: (match: MatchHistoryEntry) => number,
): BucketStats[] => {
  const buckets = new Map<number, { matches: number; wins: number }>();

  for (const match of matches) {
    if (isUnscored(match)) continue;
    const key = bucketOf(match);
    const entry = buckets.get(key) ?? { matches: 0, wins: 0 };
    entry.matches++;
    if (isWin(match)) entry.wins++;
    buckets.set(key, entry);
  }

  return [...buckets.entries()]
    .map(([bucket, entry]) => ({
      bucket,
      matches: entry.matches,
      wins: entry.wins,
      winrate: entry.wins / entry.matches,
    }))
    .sort((a, b) => a.bucket - b.bucket);
};

export const winrateByHour = (matches: MatchHistoryEntry[]): BucketStats[] =>
  bucketize(matches, (match) => new Date(match.start_time * 1000).getHours());

export const winrateByWeekday = (matches: MatchHistoryEntry[]): BucketStats[] =>
  bucketize(matches, (match) => new Date(match.start_time * 1000).getDay());

const SESSION_GAP_MS = 3 * 60 * 60 * 1000;
export const MAX_SESSION_POSITION = 6;

export const sessionPositions = (
  matches: MatchHistoryEntry[],
): Array<{ match: MatchHistoryEntry; position: number }> => {
  let position = 0;
  let previousEnd = Number.NEGATIVE_INFINITY;

  return chronological(matches).map((match) => {
    const start = match.start_time * 1000;
    position = start - previousEnd > SESSION_GAP_MS ? 1 : position + 1;
    previousEnd = start + match.match_duration_s * 1000;
    return { match, position: Math.min(position, MAX_SESSION_POSITION) };
  });
};

export interface PlaySession {
  matches: MatchHistoryEntry[];
  startTime: number;
  endTime: number;
  wins: number;
  losses: number;
  rankSteps: number | null;
}

const rankedBadge = (match: MatchHistoryEntry): number | null =>
  match.ranked_display_badge !== null && match.ranked_display_badge > 0
    ? match.ranked_display_badge
    : null;

export const playSessions = (matches: MatchHistoryEntry[]): PlaySession[] => {
  const sessions: MatchHistoryEntry[][] = [];
  for (const { match, position } of sessionPositions(matches)) {
    const current = sessions[sessions.length - 1];
    if (position === 1 || !current) {
      sessions.push([match]);
    } else {
      current.unshift(match);
    }
  }

  const result: PlaySession[] = [];
  let badgeBefore: number | null = null;
  for (const games of sessions) {
    const latestBadge =
      games.map(rankedBadge).find((badge) => badge !== null) ?? null;
    const newest = games[0];
    const oldest = games[games.length - 1];
    result.unshift({
      matches: games,
      startTime: oldest?.start_time ?? 0,
      endTime: newest ? newest.start_time + newest.match_duration_s : 0,
      wins: games.filter(isWin).length,
      losses: games.filter((match) => matchOutcome(match) === "loss").length,
      rankSteps:
        badgeBefore !== null && latestBadge !== null
          ? badgeToStep(latestBadge) - badgeToStep(badgeBefore)
          : null,
    });
    badgeBefore = latestBadge ?? badgeBefore;
  }
  return result;
};

export const sessionCurve = (matches: MatchHistoryEntry[]): BucketStats[] => {
  const byPosition = new Map<number, MatchHistoryEntry[]>();
  for (const { match, position: slot } of sessionPositions(matches)) {
    if (isUnscored(match)) continue;
    const bucket = byPosition.get(slot);
    if (bucket) {
      bucket.push(match);
    } else {
      byPosition.set(slot, [match]);
    }
  }

  return [...byPosition.entries()]
    .map(([bucket, bucketMatches]) => {
      const summary = summarize(bucketMatches);
      return {
        bucket,
        matches: summary.matches,
        wins: summary.wins,
        winrate: summary.winrate,
      };
    })
    .sort((a, b) => a.bucket - b.bucket);
};

export interface TodaysSession {
  matches: MatchHistoryEntry[];
  wins: number;
  losses: number;
  best: MatchHistoryEntry | undefined;
}

const sessionScore = (match: MatchHistoryEntry) =>
  match.player_kills + match.player_assists - match.player_deaths;

export const todaysSession = (
  matches: MatchHistoryEntry[],
  now = new Date(),
): TodaysSession => {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const since = midnight.getTime() / 1000;
  const today = matches
    .filter((match) => match.start_time >= since)
    .sort((a, b) => a.start_time - b.start_time);
  return {
    matches: today,
    wins: today.filter(isWin).length,
    losses: today.filter((match) => matchOutcome(match) === "loss").length,
    best: [...today].sort((a, b) => sessionScore(b) - sessionScore(a))[0],
  };
};

export interface BenchmarkMetric {
  metric:
    | "kills"
    | "deaths"
    | "assists"
    | "lastHits"
    | "denies"
    | "netWorth"
    | "playerDamage";
  mine: number;
  global: number;
  deltaPct: number;
  higherIsBetter: boolean;
}

const perMatch = (total: number, matches: number): number =>
  matches > 0 ? total / matches : 0;

export const benchmarkDeltas = (
  mine: PlayerHeroStats,
  global: AnalyticsHeroStats,
): BenchmarkMetric[] => {
  const rows: Array<
    Pick<BenchmarkMetric, "metric" | "higherIsBetter"> & {
      mine: number;
      global: number;
    }
  > = [
    {
      metric: "kills",
      higherIsBetter: true,
      mine: perMatch(mine.kills, mine.matches_played),
      global: perMatch(global.total_kills, global.matches),
    },
    {
      metric: "deaths",
      higherIsBetter: false,
      mine: perMatch(mine.deaths, mine.matches_played),
      global: perMatch(global.total_deaths, global.matches),
    },
    {
      metric: "assists",
      higherIsBetter: true,
      mine: perMatch(mine.assists, mine.matches_played),
      global: perMatch(global.total_assists, global.matches),
    },
    {
      metric: "lastHits",
      higherIsBetter: true,
      mine:
        mine.last_hits_per_min *
        (mine.time_played / 60 / Math.max(mine.matches_played, 1)),
      global: perMatch(global.total_last_hits, global.matches),
    },
    {
      metric: "denies",
      higherIsBetter: true,
      mine: mine.denies_per_match,
      global: perMatch(global.total_denies, global.matches),
    },
    {
      metric: "netWorth",
      higherIsBetter: true,
      mine:
        mine.networth_per_min *
        (mine.time_played / 60 / Math.max(mine.matches_played, 1)),
      global: perMatch(global.total_net_worth, global.matches),
    },
    {
      metric: "playerDamage",
      higherIsBetter: true,
      mine: perMatch(mine.total_player_damage, mine.matches_played),
      global: perMatch(global.total_player_damage, global.matches),
    },
  ];

  return rows.map(({ metric, higherIsBetter, mine, global }) => ({
    metric,
    higherIsBetter,
    mine,
    global,
    deltaPct: global > 0 ? (mine - global) / global : 0,
  }));
};

export interface MateInsight {
  mateId: number;
  matchesTogether: number;
  winsTogether: number;
  winrateTogether: number;
  winrateDelta: number;
  kdaTogether: number;
  lastPlayed: number;
}

export const joinMateStats = (
  mates: MateStats[],
  matches: MatchHistoryEntry[],
  minMatches = 5,
): MateInsight[] => {
  const byId = new Map(matches.map((match) => [match.match_id, match]));

  return mates
    .map((mate) => {
      const shared = mate.matches
        .map((matchId) => byId.get(matchId))
        .filter((match): match is MatchHistoryEntry => match !== undefined);
      const sharedIds = new Set(shared.map((match) => match.match_id));
      const without = matches.filter((match) => !sharedIds.has(match.match_id));

      const together = summarize(shared);
      const solo = summarize(without);

      return {
        mateId: mate.mate_id,
        matchesTogether: together.matches,
        winsTogether: together.wins,
        winrateTogether: together.winrate,
        winrateDelta: together.winrate - solo.winrate,
        kdaTogether: together.kda,
        lastPlayed: shared.reduce(
          (latest, match) => Math.max(latest, match.start_time),
          0,
        ),
      };
    })
    .filter((mate) => mate.matchesTogether >= minMatches)
    .sort((a, b) => b.matchesTogether - a.matchesTogether);
};

export interface HeroPerformance {
  heroId: number;
  matches: number;
  wins: number;
  winrate: number;
  kda: number;
  soulsPerMin: number;
  accuracy: number;
  damagePerMin: number;
  lastPlayed: number;
  timePlayedMin: number;
}

export const heroPerformance = (
  heroStats: PlayerHeroStats[],
): HeroPerformance[] =>
  heroStats
    .filter((hero) => hero.matches_played > 0)
    .map((hero) => ({
      heroId: hero.hero_id,
      matches: hero.matches_played,
      wins: hero.wins,
      winrate: hero.wins / hero.matches_played,
      kda: (hero.kills + hero.assists) / Math.max(hero.deaths, 1),
      soulsPerMin: hero.networth_per_min,
      accuracy: hero.accuracy,
      damagePerMin: hero.damage_per_min,
      lastPlayed: hero.last_played,
      timePlayedMin: hero.time_played / 60,
    }))
    .sort((a, b) => b.matches - a.matches);

export interface ItemInsight {
  itemId: number;
  matches: number;
  winrate: number;
  winrateDelta: number;
  globalWinrate: number;
  avgBuyTimeS: number;
  buyTimeDeltaS: number;
}

export const joinItemStats = (
  mine: ItemStats[],
  global: ItemStats[],
  minMatches = 5,
): ItemInsight[] => {
  const globalById = new Map(global.map((item) => [item.item_id, item]));

  return mine
    .filter((item) => item.matches >= minMatches)
    .map((item) => {
      const reference = globalById.get(item.item_id);
      const winrate = item.wins / item.matches;
      const globalWinrate = reference
        ? reference.wins / reference.matches
        : winrate;
      return {
        itemId: item.item_id,
        matches: item.matches,
        winrate,
        globalWinrate,
        winrateDelta: winrate - globalWinrate,
        avgBuyTimeS: item.avg_buy_time_s,
        buyTimeDeltaS: reference
          ? item.avg_buy_time_s - reference.avg_buy_time_s
          : 0,
      };
    })
    .sort((a, b) => b.matches - a.matches);
};

export type Insight =
  | { kind: "form"; tone: Tone; recent: number; career: number }
  | { kind: "streak"; tone: Tone; length: number; won: boolean }
  | {
      kind: "session";
      tone: Tone;
      position: number;
      winrate: number;
      baseline: number;
    }
  | {
      kind: "hours";
      tone: Tone;
      hour: number;
      winrate: number;
      baseline: number;
    }
  | {
      kind: "comfortHero";
      tone: Tone;
      heroId: number;
      winrate: number;
      matches: number;
    }
  | {
      kind: "trapHero";
      tone: Tone;
      heroId: number;
      winrate: number;
      matches: number;
    }
  | {
      kind: "topHero";
      tone: Tone;
      heroId: number;
      winrate: number;
      matches: number;
    }
  | {
      kind: "longGames";
      tone: Tone;
      winrate: number;
      baseline: number;
      minutes: number;
    };

export type Tone = "good" | "bad" | "neutral";

const RECENT_WINDOW = 30;
const MIN_BUCKET_MATCHES = 15;
const SIGNIFICANT_WINRATE_GAP = 0.06;

const extremeBy = <T>(
  items: T[],
  score: (item: T) => number,
  better: (candidate: number, incumbent: number) => boolean,
): T | null =>
  items.reduce<T | null>(
    (best, item) =>
      best === null || better(score(item), score(best)) ? item : best,
    null,
  );

const minBy = <T>(items: T[], score: (item: T) => number) =>
  extremeBy(items, score, (a, b) => a < b);

const maxBy = <T>(items: T[], score: (item: T) => number) =>
  extremeBy(items, score, (a, b) => a > b);

export const generateInsights = (
  matches: MatchHistoryEntry[],
  heroes: HeroPerformance[],
): Insight[] => {
  if (matches.length < MIN_BUCKET_MATCHES) {
    return [];
  }

  const insights: Insight[] = [];
  const ordered = chronological(matches);
  const career = summarize(ordered);
  const recent = summarize(ordered.slice(-RECENT_WINDOW));

  if (Math.abs(recent.winrate - career.winrate) >= SIGNIFICANT_WINRATE_GAP) {
    insights.push({
      kind: "form",
      tone: recent.winrate > career.winrate ? "good" : "bad",
      recent: recent.winrate,
      career: career.winrate,
    });
  }

  const streak = streaks(ordered);
  if (Math.abs(streak.current) >= 3) {
    insights.push({
      kind: "streak",
      tone: streak.current > 0 ? "good" : "bad",
      length: Math.abs(streak.current),
      won: streak.current > 0,
    });
  }

  const worstSession = minBy(
    sessionCurve(ordered).filter(
      (slot) => slot.bucket > 1 && slot.matches >= MIN_BUCKET_MATCHES,
    ),
    (slot) => slot.winrate,
  );
  if (
    worstSession &&
    career.winrate - worstSession.winrate >= SIGNIFICANT_WINRATE_GAP
  ) {
    insights.push({
      kind: "session",
      tone: "bad",
      position: worstSession.bucket,
      winrate: worstSession.winrate,
      baseline: career.winrate,
    });
  }

  const worstHour = minBy(
    winrateByHour(ordered).filter((slot) => slot.matches >= MIN_BUCKET_MATCHES),
    (slot) => slot.winrate,
  );
  if (
    worstHour &&
    career.winrate - worstHour.winrate >= SIGNIFICANT_WINRATE_GAP
  ) {
    insights.push({
      kind: "hours",
      tone: "bad",
      hour: worstHour.bucket,
      winrate: worstHour.winrate,
      baseline: career.winrate,
    });
  }

  const ranked = heroes.filter((hero) => hero.matches >= 10);
  const best = maxBy(ranked, (hero) => hero.winrate);
  const worst = minBy(ranked, (hero) => hero.winrate);

  if (best && best.winrate - career.winrate >= SIGNIFICANT_WINRATE_GAP) {
    insights.push({
      kind: "comfortHero",
      tone: "good",
      heroId: best.heroId,
      winrate: best.winrate,
      matches: best.matches,
    });
  }
  if (worst && career.winrate - worst.winrate >= SIGNIFICANT_WINRATE_GAP) {
    insights.push({
      kind: "trapHero",
      tone: "bad",
      heroId: worst.heroId,
      winrate: worst.winrate,
      matches: worst.matches,
    });
  }

  return [...insights, ...fallbackInsights(ordered, heroes, career, insights)];
};

const LONG_MATCH_S = 35 * 60;

const fallbackInsights = (
  ordered: MatchHistoryEntry[],
  heroes: HeroPerformance[],
  career: StatsSummary,
  chosen: Insight[],
): Insight[] => {
  const fallbacks: Insight[] = [];

  const mostPlayed = maxBy(heroes, (hero) => hero.matches);
  const heroAlreadyShown = chosen.some(
    (insight) =>
      (insight.kind === "comfortHero" || insight.kind === "trapHero") &&
      insight.heroId === mostPlayed?.heroId,
  );
  if (mostPlayed && !heroAlreadyShown) {
    fallbacks.push({
      kind: "topHero",
      tone: mostPlayed.winrate >= career.winrate ? "good" : "neutral",
      heroId: mostPlayed.heroId,
      winrate: mostPlayed.winrate,
      matches: mostPlayed.matches,
    });
  }

  const longGames = ordered.filter(
    (match) => match.match_duration_s >= LONG_MATCH_S,
  );
  if (longGames.length >= MIN_BUCKET_MATCHES) {
    const long = summarize(longGames);
    fallbacks.push({
      kind: "longGames",
      tone: long.winrate >= career.winrate ? "good" : "bad",
      winrate: long.winrate,
      baseline: career.winrate,
      minutes: LONG_MATCH_S / 60,
    });
  }

  return fallbacks;
};

export const heroStatsByAccount = (
  heroStats: PlayerHeroStats[],
): Map<number, PlayerHeroStats[]> => {
  const byAccount = new Map<number, PlayerHeroStats[]>();
  for (const entry of heroStats) {
    const existing = byAccount.get(entry.account_id);
    if (existing) {
      existing.push(entry);
    } else {
      byAccount.set(entry.account_id, [entry]);
    }
  }
  return byAccount;
};
