import { invoke } from "@tauri-apps/api/core";
import type {
  FoundryCardPreview,
  FoundryManifest,
  FoundryModel,
  FoundryTexture,
} from "@/types/foundry";

/**
 * Parse a skin VPK and return its entries grouped by editing category. The
 * backend flags non-hero (map) mods via `isHeroSkin = false` so the Foundry can
 * refuse them before opening the editor.
 */
export const analyzeFoundryVpk = async (
  filePath: string,
): Promise<FoundryManifest> => {
  return await invoke<FoundryManifest>("foundry_analyze_vpk", { filePath });
};

/**
 * Open the base game's default skin assets for one hero from `pak01_dir.vpk`.
 * This is read-only and does not create or download a mod.
 */
export const analyzeDefaultFoundryHero = async (
  heroDisplay: string,
): Promise<FoundryManifest> => {
  return await invoke<FoundryManifest>("foundry_analyze_default_hero", {
    heroDisplay,
  });
};

/**
 * Resolve the absolute path to a stored mod's primary VPK so it can be imported
 * into the Foundry without a manual file pick.
 */
export const resolveModVpk = async (
  modId: string,
  installedVpks: string[] = [],
  profileFolder: string | null = null,
): Promise<string> => {
  return await invoke<string>("foundry_resolve_mod_vpk", {
    modId,
    installedVpks,
    profileFolder,
  });
};

/**
 * Decode a `.vtex_c` entry (card or texture) to a PNG data URL for previewing.
 */
export const decodeFoundryTexture = async (
  filePath: string,
  entryPath: string,
): Promise<FoundryTexture> => {
  return await invoke<FoundryTexture>("foundry_decode_texture", {
    filePath,
    entryPath,
  });
};

/**
 * Decode every hero-card texture for the active skin and the matching base-game
 * defaults. The Foundry starts this in the background as soon as a skin loads.
 */
export const decodeFoundryCards = async (
  filePath: string,
  hero: string | null,
  heroDisplay: string | null,
): Promise<FoundryCardPreview[]> => {
  return await invoke<FoundryCardPreview[]>("foundry_decode_cards", {
    filePath,
    hero,
    heroDisplay,
  });
};

/**
 * Decode a `.vmesh_c`, or resolve a `.vmdl_c`, to a GLB data URL for the 3D
 * preview.
 */
export const decodeFoundryModel = async (
  filePath: string,
  entryPath: string,
): Promise<FoundryModel> => {
  return await invoke<FoundryModel>("foundry_decode_model", {
    filePath,
    entryPath,
  });
};
