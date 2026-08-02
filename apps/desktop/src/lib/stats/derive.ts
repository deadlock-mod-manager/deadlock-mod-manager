import type {
  AnalyticsHeroStats,
  ItemStats,
  MatchHistoryEntry,
  MateStats,
  PlayerHeroStats,
} from "@/lib/stats/api";

/**
 * Everything on the Stats page is derived from the one match-history payload, so
 * a full dashboard costs a handful of requests instead of one per widget.
 */

/** `match_result` holds the winning team index, so it wins when it is our team. */
export const isWin = (match: MatchHistoryEntry): boolean =>
  match.match_result === match.player_team;

/** The API returns newest first; charts read left to right. */
export const chronological = (
  matches: MatchHistoryEntry[],
): MatchHistoryEntry[] =>
  [...matches].sort((a, b) => a.start_time - b.start_time);

/**
 * Merges the matches the Game Coordinator knows about into the API's history.
 *
 * deadlock-api ingests with up to a day of delay, so today's games are missing
 * from it while the GC already has them. The API entry wins on conflicts - it is
 * the richer record - and local-only matches are appended.
 */
export const mergeLocalMatches = (
  api: MatchHistoryEntry[],
  local: MatchHistoryEntry[],
): MatchHistoryEntry[] => {
  const extra = localOnlyMatches(api, local);
  return extra.length === 0 ? api : [...extra, ...api];
};

/** The local matches the API does not know yet - the gap everything else fills from. */
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

/**
 * Folds matches the API has not ingested into its per-hero aggregates.
 *
 * `hero-stats` lags the same day the match history does, so without this the
 * Heroes tab would ignore everything played today - including a hero picked up
 * for the first time, which would be missing entirely rather than merely stale.
 *
 * Only the counters that can be reconstructed from a match row are updated; the
 * per-minute rates and accuracy stay on the API's values, which is why they are
 * left alone rather than recomputed from a partial picture.
 */
export const mergeHeroStats = (
  heroStats: PlayerHeroStats[],
  extraMatches: MatchHistoryEntry[],
): PlayerHeroStats[] => {
  if (extraMatches.length === 0) {
    return heroStats;
  }

  const byHero = new Map(heroStats.map((hero) => [hero.hero_id, { ...hero }]));

  for (const match of extraMatches) {
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
  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let netWorth = 0;
  let lastHits = 0;
  let durationS = 0;

  for (const match of matches) {
    if (isWin(match)) wins++;
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
    winrate: wins / matches.length,
    kills: kills / matches.length,
    deaths: deaths / matches.length,
    assists: assists / matches.length,
    // Deathless stretches would divide by zero; count them as a single death.
    kda: (kills + assists) / Math.max(deaths, 1),
    soulsPerMin: minutes > 0 ? netWorth / minutes : 0,
    lastHitsPerMin: minutes > 0 ? lastHits / minutes : 0,
    avgDurationMin: minutes / matches.length,
  };
};

export interface RollingPoint {
  matchId: number;
  startTime: number;
  /** Winrate across the trailing `window` matches, `null` until it is filled. */
  winrate: number | null;
  kda: number;
}

export const rollingWinrate = (
  matches: MatchHistoryEntry[],
  window = 20,
): RollingPoint[] => {
  const ordered = chronological(matches);
  return ordered.map((match, index) => {
    const slice = ordered.slice(Math.max(0, index - window + 1), index + 1);
    const summary = summarize(slice);
    return {
      matchId: match.match_id,
      startTime: match.start_time,
      // Leave the line blank until the window is actually full, otherwise the
      // first few points swing between 0 and 1.
      winrate: slice.length >= window ? summary.winrate : null,
      kda: summary.kda,
    };
  });
};

/** A rolling-winrate point that actually has a value, ready to plot. */
export interface FormPoint {
  startTime: number;
  /** Percent, not a fraction: recharts axes are configured in whole percent. */
  winrate: number;
}

/**
 * The plot-ready form curve: the rolling winrate with the not-yet-filled leading
 * points dropped. Both form charts want exactly this, so neither has to re-derive
 * it (and neither has to assert the nullable winrate away).
 */
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
  /** Positive for a win streak, negative for a loss streak. */
  current: number;
  longestWin: number;
  longestLoss: number;
}

export const streaks = (matches: MatchHistoryEntry[]): StreakInfo => {
  const ordered = chronological(matches);
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

/** Local hour of day (0-23) - timezone matters, the player's evening is what counts. */
export const winrateByHour = (matches: MatchHistoryEntry[]): BucketStats[] =>
  bucketize(matches, (match) => new Date(match.start_time * 1000).getHours());

/** 0 = Sunday, matching `Date#getDay`. */
export const winrateByWeekday = (matches: MatchHistoryEntry[]): BucketStats[] =>
  bucketize(matches, (match) => new Date(match.start_time * 1000).getDay());

const SESSION_GAP_MS = 3 * 60 * 60 * 1000;
/** Beyond this the samples get too thin to say anything. */
const MAX_SESSION_POSITION = 6;

/**
 * Winrate by position within a session (matches less than 3h apart), capped at
 * `MAX_SESSION_POSITION`. A steep drop-off is the clearest "stop playing" signal
 * the history can give.
 */
export const sessionCurve = (matches: MatchHistoryEntry[]): BucketStats[] => {
  const ordered = chronological(matches);
  let position = 0;
  let previousEnd = Number.NEGATIVE_INFINITY;

  const positioned = ordered.map((match) => {
    const start = match.start_time * 1000;
    position = start - previousEnd > SESSION_GAP_MS ? 1 : position + 1;
    previousEnd = start + match.match_duration_s * 1000;
    return { match, position: Math.min(position, MAX_SESSION_POSITION) };
  });

  const byPosition = new Map<number, MatchHistoryEntry[]>();
  for (const { match, position: slot } of positioned) {
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
  /** Signed percentage difference from the global average. */
  deltaPct: number;
  /** False for deaths, where being under the average is the good outcome. */
  higherIsBetter: boolean;
}

const perMatch = (total: number, matches: number): number =>
  matches > 0 ? total / matches : 0;

/**
 * Per-match averages of the player on one hero against every player on that hero.
 * The analytics endpoint only reports totals, so both sides are normalised here.
 */
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

  return rows.map((row) => ({
    ...row,
    deltaPct: row.global > 0 ? (row.mine - row.global) / row.global : 0,
  }));
};

export interface MateInsight {
  mateId: number;
  matchesTogether: number;
  winsTogether: number;
  winrateTogether: number;
  /** Winrate difference against the same player's matches without this mate. */
  winrateDelta: number;
  kdaTogether: number;
  lastPlayed: number;
}

/**
 * Mate stats only carry match ids; intersecting them with the own history turns
 * them into "how do I actually play with this person".
 */
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
      lastPlayed: hero.last_played,
      timePlayedMin: hero.time_played / 60,
    }))
    .sort((a, b) => b.matches - a.matches);

export interface ItemInsight {
  itemId: number;
  matches: number;
  winrate: number;
  /** Winrate difference against everyone else building the same item. */
  winrateDelta: number;
  globalWinrate: number;
  avgBuyTimeS: number;
  /** Positive means the player buys it later into the match than average. */
  buyTimeDeltaS: number;
}

/**
 * Joins the player's item stats with the global ones. The interesting part is
 * not the raw winrate - good items win for everyone - but the gap to how the
 * same item performs in everyone else's hands, and how late it gets bought.
 */
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
/** Below this a bucket is noise, not a pattern. */
const MIN_BUCKET_MATCHES = 15;
const SIGNIFICANT_WINRATE_GAP = 0.06;

// The insights are all "the one entry that stands out", which is a min or a max
// on an empty-able list. Named here so the rules below read as rules.
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

/**
 * Ranks the notable deviations in the history so the dashboard can show a few
 * sentences that are actually actionable instead of a wall of numbers.
 */
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

/** Beyond this a match counts as a long game for the closing-out insight. */
const LONG_MATCH_S = 35 * 60;

/**
 * Observations that hold regardless of how the season is going. The threshold
 * insights above only fire on a real deviation, so on a steady account they can
 * run out; these keep the list filled with something true rather than leaving a
 * hole in the grid.
 */
const fallbackInsights = (
  ordered: MatchHistoryEntry[],
  heroes: HeroPerformance[],
  career: StatsSummary,
  chosen: Insight[],
): Insight[] => {
  const fallbacks: Insight[] = [];

  const mostPlayed = maxBy(heroes, (hero) => hero.matches);
  // Skip it when the same hero already carries a comfort/trap card.
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
