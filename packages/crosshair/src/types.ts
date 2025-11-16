import type { DeadlockHeroes } from "@deadlock-mods/shared";

export type HerosWithCrosshairOverrides =
  | DeadlockHeroes.Abrams
  | DeadlockHeroes.Yamato
  | DeadlockHeroes.Shiv
  | DeadlockHeroes.MoKrill
  | "Default";

export interface CrosshairConfig {
  gap: number; // -20 to 50
  width: number; // 0 to 100 (step 0.1)
  height: number; // 0 to 100 (step 0.1)
  pipOpacity: number; // 0 to 1 (step 0.1)
  dotOpacity: number; // 0 to 1 (step 0.1)
  dotOutlineOpacity: number; // 0 to 1 (step 0.1)
  color: { r: number; g: number; b: number }; // 0-255
  pipBorder: boolean;
  pipGapStatic: boolean;
  hero: HerosWithCrosshairOverrides;
}

export interface CrosshairMetadata {
  id: string;
  name: string;
  description?: string;
  author?: string;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
  hero?: HerosWithCrosshairOverrides;
  favorites?: number; // For web gallery
  downloads?: number; // For web gallery
}

export interface Crosshair {
  metadata: CrosshairMetadata;
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
