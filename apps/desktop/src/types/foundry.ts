// Mirrors the Rust types returned by the `foundry_*` commands
// (apps/desktop/src-tauri/src/commands/foundry/types.rs).

export type FoundryCategory =
  | "model"
  | "material"
  | "texture"
  | "card"
  | "sound"
  | "other";

/** Where an entry's bytes come from: the mod VPK, the base game, or an edit. */
export type FoundryEntrySource = "mod" | "default" | "workspace";

export interface FoundryEntry {
  path: string;
  filename: string;
  ext: string;
  size: number;
  category: FoundryCategory;
  source: FoundryEntrySource;
}

export type FoundrySoundGroupKind =
  | "ability"
  | "voice"
  | "weapon"
  | "soundevents"
  | "other";

export interface FoundrySoundGroup {
  id: string;
  kind: FoundrySoundGroupKind;
  slot: number | null;
  label: string;
  entries: FoundryEntry[];
}

export interface FoundryManifest {
  filePath: string;
  /** The VPK the user opened; empty for a default-hero load. */
  sourcePath: string;
  hero: string | null;
  heroDisplay: string | null;
  isHeroSkin: boolean;
  entryCount: number;
  models: FoundryEntry[];
  materials: FoundryEntry[];
  textures: FoundryEntry[];
  cards: FoundryEntry[];
  sounds: FoundryEntry[];
  other: FoundryEntry[];
  soundGroups: FoundrySoundGroup[];
}

export interface FoundryTexture {
  width: number;
  height: number;
  dataUrl: string;
}

export interface FoundryModel {
  vertexCount: number;
  indexCount: number;
  dataUrl: string;
}

export interface FoundrySoundPreview {
  dataUrl: string;
  mimeType: string;
}

export interface FoundryWorkspace {
  root: string;
  filesDir: string;
  vpkCopy: string;
  fileCount: number;
  created: boolean;
}

export interface FoundryBuildResult {
  outputPath: string;
  fileCount: number;
  size: number;
}

export interface FoundryReplacementResult {
  entry: FoundryEntry;
  texture: FoundryTexture | null;
}

export type FoundryCardSource = "mod" | "default";

export interface FoundryCardPreview {
  source: FoundryCardSource;
  path: string;
  filename: string;
  variant: string;
  width: number;
  height: number;
  dataUrl: string;
}

/**
 * The parts of a hero the paint tab can recolor. Deadlock ships a hero's weapon
 * as a single material, so there is no finer split than this.
 */
export type FoundryPaintTargetId =
  | "body"
  | "weapon"
  | "bodyAndWeapon"
  | "abilities";

export interface FoundryPaintTargetInfo {
  id: FoundryPaintTargetId;
  textureCount: number;
  particleCount: number;
}

export interface FoundryPaintResult {
  target: FoundryPaintTargetId;
  paintedPaths: string[];
  skippedPaths: string[];
}

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

/** Where a finished skin should go. */
export type FoundryExportDestination = "file" | "newMod" | "replaceSource";

export interface FoundryExportRequest {
  destination: FoundryExportDestination;
  name?: string | null;
  /** Required for `file`. */
  outputPath?: string | null;
  /** Defaults to the loaded skin's source VPK; required for `replaceSource`. */
  sourcePath?: string | null;
}

export interface FoundryExportResult {
  destination: FoundryExportDestination;
  outputPath: string;
  fileCount: number;
  size: number;
  /** Set for `newMod`, so the library can pick the mod up. */
  modId: string | null;
  modName: string | null;
  /** Set for `replaceSource`: where the original was kept. */
  backupPath: string | null;
}

export type FoundryTab = "assets" | "paint" | "cards" | "sounds";
