import type { PerfTier } from "@/types/generated/PerfTier";

type TierInfo = {
  id: PerfTier;
  position: number;
};

export const TIERS: readonly TierInfo[] = [
  { id: "pretty", position: 0.1 },
  { id: "balanced", position: 0.3 },
  { id: "lean", position: 0.5 },
  { id: "sweaty", position: 0.7 },
  { id: "potato", position: 0.9 },
];

export const tierInfo = (tier: PerfTier): TierInfo =>
  TIERS.find((info) => info.id === tier) ?? TIERS[1];

export const tierForScore = (score: number): TierInfo => {
  const clamped = Math.min(1, Math.max(0, score));
  return TIERS.reduce((best, info) =>
    Math.abs(info.position - clamped) < Math.abs(best.position - clamped)
      ? info
      : best,
  );
};

const PRESET_BAND = 0.16;

export const presetPosition = (tier: PerfTier, cutScore: number) => {
  const clamped = Math.min(1, Math.max(0, cutScore));
  return tierInfo(tier).position - PRESET_BAND / 2 + clamped * PRESET_BAND;
};

export const tierLevel = (tier: PerfTier) =>
  TIERS.findIndex((info) => info.id === tier) + 1;
