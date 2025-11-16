import { HERO_GAP_CONFIGS, STATIC_GAP_BASE } from "./constants";
import type { CrosshairConfig } from "./types";

export const calculateGap = (config: CrosshairConfig): number => {
  if (config.pipGapStatic) {
    return STATIC_GAP_BASE + config.gap * 1;
  }

  const heroConfig = HERO_GAP_CONFIGS[config.hero];
  const baseGap = heroConfig.baseGap + heroConfig.additionalGap;
  const increment = config.gap <= heroConfig.threshold ? 1 : 2;

  return baseGap + config.gap * increment;
};

export const getIncrementValue = (config: CrosshairConfig): number => {
  if (config.pipGapStatic) {
    return 1;
  }

  const heroConfig = HERO_GAP_CONFIGS[config.hero];
  return config.gap <= heroConfig.threshold ? 1 : 2;
};
