import { DeadlockHeroes } from "@deadlock-mods/shared";
import type { HeroGapConfig, HerosWithCrosshairOverrides } from "./types";

export const HERO_GAP_CONFIGS: Record<
  HerosWithCrosshairOverrides,
  HeroGapConfig
> = {
  [DeadlockHeroes.Abrams]: {
    baseGap: 11,
    additionalGap: 28,
    threshold: -7,
  },
  [DeadlockHeroes.Yamato]: {
    baseGap: 11,
    additionalGap: 28,
    threshold: -7,
  },
  [DeadlockHeroes.Shiv]: {
    baseGap: 11,
    additionalGap: 20,
    threshold: -3,
  },
  [DeadlockHeroes.MoKrill]: {
    baseGap: 11,
    additionalGap: 14,
    threshold: -3,
  },
  Default: {
    baseGap: 11,
    additionalGap: 0,
    threshold: 0,
  },
};

export const STATIC_GAP_BASE = 4;

export const CANVAS_CONSTANTS = {
  BORDER_WIDTH: 1,
  CIRCLE_RADIUS: 3,
  CIRCLE_HEIGHT_OFFSET: 0.25,
  DOT_OFFSET_X: 1.5,
  DOT_OFFSET_Y: 1,
  DOT_WIDTH: 2,
  DOT_HEIGHT: 2,
  CIRCLE_STROKE_WIDTH: 1.5,
  ASPECT_RATIO: 16 / 9,
} as const;
