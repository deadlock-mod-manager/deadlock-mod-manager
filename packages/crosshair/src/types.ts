import type {
  CrosshairConfig,
  DeadlockHeroes,
} from "@deadlock-mods/shared";

export type { CrosshairConfig };

export type HerosWithCrosshairOverrides =
  | DeadlockHeroes.Abrams
  | DeadlockHeroes.Yamato
  | DeadlockHeroes.Shiv
  | DeadlockHeroes.MoKrill
  | "Default";

export interface Crosshair {
  config: CrosshairConfig;
}

export interface HeroGapConfig {
  baseGap: number;
  threshold: number;
  additionalGap: number;
}

export const DEFAULT_CROSSHAIR_CONFIG: CrosshairConfig = {
  gap: 0,
  width: 4,
  height: 16,
  pipOpacity: 1,
  dotOpacity: 1,
  dotOutlineOpacity: 1,
  color: { r: 255, g: 255, b: 255 },
  pipBorder: false,
  pipGapStatic: false,
  hero: "Default" as HerosWithCrosshairOverrides,
};
