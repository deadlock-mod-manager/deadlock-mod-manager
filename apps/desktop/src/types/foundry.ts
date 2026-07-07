// Mirrors the Rust `FoundryManifest` / `FoundryEntry` shapes returned by the
// `foundry_analyze_vpk` command (apps/desktop/src-tauri/src/commands/foundry.rs).

export type FoundryCategory =
  | "model"
  | "material"
  | "texture"
  | "card"
  | "particle"
  | "sound"
  | "other";

export interface FoundryEntry {
  path: string;
  filename: string;
  ext: string;
  size: number;
  category: FoundryCategory;
}

export interface FoundryManifest {
  filePath: string;
  hero: string | null;
  heroDisplay: string | null;
  isHeroSkin: boolean;
  entryCount: number;
  models: FoundryEntry[];
  materials: FoundryEntry[];
  textures: FoundryEntry[];
  cards: FoundryEntry[];
  particles: FoundryEntry[];
  sounds: FoundryEntry[];
  other: FoundryEntry[];
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

export type FoundryTab = "skin" | "cards" | "effects" | "sounds";
