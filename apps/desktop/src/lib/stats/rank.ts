import type {
  BadgeDistributionEntry,
  PlayerRank,
  RankedSeason,
} from "@/lib/stats/api";

/**
 * The current ranking system, decoded.
 *
 * Valve dropped the MMR estimate and replaced it with a flat progress counter.
 * A badge is `tier * 10 + subrank`, every tier holds six subranks, and a subrank
 * spans 1000 progress points - so the counter alone places a player exactly,
 * down to the fraction of a subrank the badge cannot show.
 */

export const SUBRANKS_PER_TIER = 6;
export const PROGRESS_PER_SUBRANK = 1000;

/**
 * Flattens a badge into a single step, which is what the progress counter counts
 * in: Phantom 6 (badge 86) is step 54, and 54000 points is exactly its floor.
 */
export const badgeToStep = (badge: number): number =>
  Math.floor(badge / 10) * SUBRANKS_PER_TIER + (badge % 10);

/**
 * The inverse. Subranks run 1-6 rather than 0-5, so the tier is the step *below*
 * this one divided out - plain integer division would push every sixth subrank
 * into the next tier.
 */
export const stepToBadge = (step: number): number => {
  if (step <= 0) {
    return 0;
  }
  const tier = Math.floor((step - 1) / SUBRANKS_PER_TIER);
  return tier * 10 + (step - tier * SUBRANKS_PER_TIER);
};

export interface RankProgress {
  /** Progress into the current subrank, 0-1. */
  fraction: number;
  /** Points into the current subrank, out of `PROGRESS_PER_SUBRANK`. */
  points: number;
  /** The badge the progress counter itself resolves to. */
  badge: number;
  /** The badge one step up, or `null` at the top of the ladder. */
  nextBadge: number | null;
  /** Progress the last ranked match actually awarded. */
  delta: number | null;
  /**
   * Progress the match would have awarded before demotion protection. Only set
   * when protection changed the outcome.
   */
  blockedLoss: number | null;
  demotionProtectionGames: number;
  /** Placement games still to play; 0 once the player is calibrated. */
  calibrationGames: number;
  winStreak: number;
  matchId: number;
  startTime: number;
}

/** The top of the ladder, past which there is no next subrank to climb to. */
const MAX_STEP = badgeToStep(116);

/**
 * Turns the rank endpoint's last-match bookkeeping into something a progress bar
 * can render. Returns `null` for an unranked account, and for a ranked one whose
 * match reported no progress counter - placements do that, and a bar sitting at
 * zero would read as "no progress" rather than "not measured yet".
 */
export const rankProgress = (rank: PlayerRank | null): RankProgress | null => {
  const match = rank?.last_match;
  const total = match?.player_rank_final_flat_progress;
  if (!match || total === null || total === undefined) {
    return null;
  }

  // Clamped to the ladder before the split, not after: capping the step alone
  // would leave the remainder above a full subrank once a counter runs past
  // Eternus 6, and a fraction over 1 overflows the bar that renders it.
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
    // The desired change is what the match was worth; when protection ate a loss
    // that is the number the player did not take.
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
  /** Share of ranked players sitting below this badge, 0-1. */
  percentile: number;
  /** Players on exactly this badge. */
  atBadge: number;
  totalPlayers: number;
}

/**
 * Where a badge sits in the ranked population. Everyone on the same badge counts
 * as half a step up, so a player is never told they beat 0% of a bracket they
 * share with thousands of others.
 */
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
  /** Badge of the tier's first subrank, for resolving the tier's artwork. */
  badge: number;
  tier: number;
  players: number;
  /** True for the tier the player themselves is in. */
  isOwn: boolean;
}

/**
 * The distribution collapsed to one bar per tier. Per-subrank it is 66 bars of
 * which two thirds are structurally empty; per tier it is eleven bars that
 * actually read as a shape.
 */
export const badgeHistogram = (
  distribution: BadgeDistributionEntry[],
  ownBadge: number,
): BadgeBucket[] => {
  // Every tier the API reports gets a bar, including one nobody has reached yet:
  // the ladder is the x axis, and a missing rung reads as a gap in the data
  // rather than as an empty bracket.
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
  /** False when the window is still ahead, i.e. this is the next season. */
  isRunning: boolean;
}

/**
 * The season that covers `now`, or the next one to start. Seasons run in
 * intervals, so "is one running" is not a property of the season itself.
 */
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
