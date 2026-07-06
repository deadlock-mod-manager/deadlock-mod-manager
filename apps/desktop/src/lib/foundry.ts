import { invoke } from "@tauri-apps/api/core";
import type { FoundryManifest, FoundryTexture } from "@/types/foundry";

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
 * Resolve the absolute path to a stored mod's primary VPK so it can be imported
 * into the Foundry without a manual file pick.
 */
export const resolveModVpk = async (modId: string): Promise<string> => {
  return await invoke<string>("foundry_resolve_mod_vpk", { modId });
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
