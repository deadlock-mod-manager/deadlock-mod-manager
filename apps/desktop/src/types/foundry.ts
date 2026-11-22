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
export type { FoundryPaintPart } from "./generated/FoundryPaintPart";
export type { FoundryPaintResult } from "./generated/FoundryPaintResult";
export type { FoundryPaintTargetInfo } from "./generated/FoundryPaintTargetInfo";
export type { FoundryRemovedParts } from "./generated/FoundryRemovedParts";
export type { FoundryReplacementResult } from "./generated/FoundryReplacementResult";
export type { FoundrySoundGroup } from "./generated/FoundrySoundGroup";
export type { FoundrySoundGroupKind } from "./generated/FoundrySoundGroupKind";
export type { FoundrySoundPreview } from "./generated/FoundrySoundPreview";
export type { FoundrySoundSettings } from "./generated/FoundrySoundSettings";
export type { FoundryTexture } from "./generated/FoundryTexture";
export type { FoundryWorkspace } from "./generated/FoundryWorkspace";
export type { PaintTarget as FoundryPaintTargetId } from "./generated/PaintTarget";

import type { ExportDestinationKind } from "./generated/ExportDestinationKind";
import type { PaintTarget } from "./generated/PaintTarget";

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

export interface FoundryPaint {
  colorHex: string;
  saturation: number;
  brightness: number;
  pattern: FoundryPatternId;
  patternIntensity: number;
  patternPhase: number;
}

export type FoundryPaintSelection =
  | { kind: "target"; target: PaintTarget }
  | { kind: "parts"; textures: string[] };

export interface FoundryExportRequest {
  destination: ExportDestinationKind;
  name?: string | null;
  outputPath?: string | null;
  sourcePath?: string | null;
}

export type FoundryTab = "assets" | "paint" | "cards" | "sounds";
