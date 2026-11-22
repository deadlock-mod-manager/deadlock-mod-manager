import type {
  BadgeDistributionEntry,
  PlayerRank,
  RankedSeason,
} from "@/lib/stats/api";

export const SUBRANKS_PER_TIER = 6;
export const PROGRESS_PER_SUBRANK = 1000;

export const badgeToStep = (badge: number): number =>
  Math.floor(badge / 10) * SUBRANKS_PER_TIER + (badge % 10);

export const stepToBadge = (step: number): number => {
  if (step <= 0) {
    return 0;
  }
  const tier = Math.floor((step - 1) / SUBRANKS_PER_TIER);
  return tier * 10 + (step - tier * SUBRANKS_PER_TIER);
};

export interface RankProgress {
  fraction: number;
  points: number;
  badge: number;
  nextBadge: number | null;
  delta: number | null;
  blockedLoss: number | null;
  demotionProtectionGames: number;
  calibrationGames: number;
  winStreak: number;
  matchId: number;
  startTime: number;
}

const MAX_STEP = badgeToStep(116);

export const rankProgress = (rank: PlayerRank | null): RankProgress | null => {
  const match = rank?.last_match;
  const total = match?.player_rank_final_flat_progress;
  if (!match || total === null || total === undefined) {
    return null;
  }

  const capped = Math.min(
    Math.max(total, 0),
    (MAX_STEP + 1) * PROGRESS_PER_SUBRANK - 1,
  );
  const step = Math.min(Math.floor(capped / PROGRESS_PER_SUBRANK), MAX_STEP);
  const points = capped - step * PROGRESS_PER_SUBRANK;
  const initial = match.player_rank_initial_flat_progress;

  return {
    fraction: points / PROGRESS_PER_SUBRANK,
    points,
    badge: stepToBadge(step),
    nextBadge: step >= MAX_STEP ? null : stepToBadge(step + 1),
    delta: initial === null || initial === undefined ? null : total - initial,
    blockedLoss: match.player_rank_consumed_demotion_protection
      ? (match.player_rank_desired_progress_change ?? null)
      : null,
    demotionProtectionGames:
      match.player_rank_initial_demotion_protection_games ?? 0,
    calibrationGames: match.player_rank_initial_calibration_games ?? 0,
    winStreak: match.player_rank_initial_win_streak ?? 0,
    matchId: match.match_id,
    startTime: match.start_time,
  };
};

export interface BadgeStanding {
  percentile: number;
  atBadge: number;
  totalPlayers: number;
}

export const badgeStanding = (
  distribution: BadgeDistributionEntry[],
  badge: number,
): BadgeStanding | null => {
  if (badge <= 0) {
    return null;
  }

  let below = 0;
  let atBadge = 0;
  let total = 0;

  for (const entry of distribution) {
    total += entry.unique_players;
    if (entry.badge_level < badge) {
      below += entry.unique_players;
    } else if (entry.badge_level === badge) {
      atBadge += entry.unique_players;
    }
  }

  if (total === 0) {
    return null;
  }

  return {
    percentile: (below + atBadge / 2) / total,
    atBadge,
    totalPlayers: total,
  };
};

export interface BadgeBucket {
  badge: number;
  tier: number;
  players: number;
  isOwn: boolean;
}

export const badgeHistogram = (
  distribution: BadgeDistributionEntry[],
  ownBadge: number,
): BadgeBucket[] => {
  const byTier = new Map<number, number>();
  for (const entry of distribution) {
    const tier = Math.floor(entry.badge_level / 10);
    byTier.set(tier, (byTier.get(tier) ?? 0) + entry.unique_players);
  }

  const ownTier = Math.floor(ownBadge / 10);
  return [...byTier.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tier, players]) => ({
      badge: tier * 10 + 1,
      tier,
      players,
      isOwn: tier === ownTier,
    }));
};

export interface SeasonWindow {
  season: RankedSeason;
  startsAt: number;
  endsAt: number;
  isRunning: boolean;
}

export const activeSeason = (
  seasons: RankedSeason[],
  nowUnix: number,
): SeasonWindow | null => {
  const windows = seasons.flatMap((season) =>
    season.intervals.map((interval) => ({
      season,
      startsAt: interval.start_timestamp,
      endsAt: interval.end_timestamp,
    })),
  );

  const running = windows.find(
    (window) => window.startsAt <= nowUnix && window.endsAt > nowUnix,
  );
  if (running) {
    return { ...running, isRunning: true };
  }

  const upcoming = windows
    .filter((window) => window.startsAt > nowUnix)
    .sort((a, b) => a.startsAt - b.startsAt)[0];
  return upcoming ? { ...upcoming, isRunning: false } : null;
};
