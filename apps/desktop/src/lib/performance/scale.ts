import type { PerfTier } from "@/types/generated/PerfTier";

type TierInfo = {
  id: PerfTier;
  emoji: string;
  /** Where the tier's stop sits on the Looks ⟷ Frames track, 0 to 1. */
  position: number;
};

export const TIERS: readonly TierInfo[] = [
  { id: "pretty", emoji: "✨", position: 0.1 },
  { id: "balanced", emoji: "⚖️", position: 0.3 },
  { id: "lean", emoji: "⚡", position: 0.5 },
  { id: "sweaty", emoji: "🔥", position: 0.7 },
  { id: "potato", emoji: "🥔", position: 0.9 },
];

export const tierInfo = (tier: PerfTier): TierInfo =>
  TIERS.find((info) => info.id === tier) ?? TIERS[1];

/** The tier whose stop is closest to a cut score, for configs without an author tier. */
export const tierForScore = (score: number): TierInfo => {
  const clamped = Math.min(1, Math.max(0, score));
  return TIERS.reduce((best, info) =>
    Math.abs(info.position - clamped) < Math.abs(best.position - clamped)
      ? info
      : best,
  );
};

/** Width of the band around a tier's stop that its presets are placed in. */
const PRESET_BAND = 0.16;

/**
 * Where a curated preset sits on the track: inside its tier's band, placed
 * within the band by its cut score. The score only counts settings, so presets
 * that set the same keys to harsher values would otherwise share one spot.
 */
export const presetPosition = (tier: PerfTier, cutScore: number) => {
  const clamped = Math.min(1, Math.max(0, cutScore));
  return tierInfo(tier).position - PRESET_BAND / 2 + clamped * PRESET_BAND;
};

/** 1-based level for the five-segment meter on cards. */
export const tierLevel = (tier: PerfTier) =>
  TIERS.findIndex((info) => info.id === tier) + 1;
