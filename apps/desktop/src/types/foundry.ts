// The shapes the `foundry_*` commands return are generated from the Rust types
// by ts-rs; run `pnpm generate-types` after changing
// apps/desktop/src-tauri/src/commands/foundry/. Everything below the re-exports
// is frontend-only state that never crosses the IPC boundary in this form.

export type { ExportDestinationKind as FoundryExportDestination } from "./generated/ExportDestinationKind";
export type { FoundryBuildResult } from "./generated/FoundryBuildResult";
export type { FoundryCardPreview } from "./generated/FoundryCardPreview";
export type { FoundryCardSource } from "./generated/FoundryCardSource";
export type { FoundryCategory } from "./generated/FoundryCategory";
export type { FoundryEntry } from "./generated/FoundryEntry";
export type { FoundryEntrySource } from "./generated/FoundryEntrySource";
export type { FoundryExportResult } from "./generated/FoundryExportResult";
export type { FoundryManifest } from "./generated/FoundryManifest";
export type { FoundryModel } from "./generated/FoundryModel";
export type { FoundryPaintResult } from "./generated/FoundryPaintResult";
export type { FoundryPaintTargetInfo } from "./generated/FoundryPaintTargetInfo";
export type { FoundryReplacementResult } from "./generated/FoundryReplacementResult";
export type { FoundrySoundGroup } from "./generated/FoundrySoundGroup";
export type { FoundrySoundGroupKind } from "./generated/FoundrySoundGroupKind";
export type { FoundrySoundPreview } from "./generated/FoundrySoundPreview";
export type { FoundryTexture } from "./generated/FoundryTexture";
export type { FoundryWorkspace } from "./generated/FoundryWorkspace";
export type { PaintTarget as FoundryPaintTargetId } from "./generated/PaintTarget";

import type { ExportDestinationKind } from "./generated/ExportDestinationKind";

/** The procedural patterns the paint tab can lay over a recolor. */
export const FOUNDRY_PATTERNS = [
  "none",
  "liquid",
  "moire",
  "kaleido",
  "holo",
  "glitch",
  "thermal",
  "camo",
  "carbon",
  "galaxy",
  "halftone",
  "lava",
  "vaporwave",
  "viscous",
  "darkmatter",
  "monochrome",
  "deco",
  "frost",
  "circuit",
] as const;

export type FoundryPatternId = (typeof FOUNDRY_PATTERNS)[number];

/** One target's current paint settings, as the paint tab holds them. */
export interface FoundryPaint {
  colorHex: string;
  saturation: number;
  brightness: number;
  pattern: FoundryPatternId;
  /** How strongly the pattern blends over the recolor, 0..1. */
  patternIntensity: number;
  /** Shifts the pattern's hue and offset, 0..1. */
  patternPhase: number;
}

export interface FoundryExportRequest {
  destination: ExportDestinationKind;
  name?: string | null;
  /** Required for `file`. */
  outputPath?: string | null;
  /** Defaults to the loaded skin's source VPK; required for `replaceSource`. */
  sourcePath?: string | null;
}

export type FoundryTab = "assets" | "paint" | "cards" | "sounds";
