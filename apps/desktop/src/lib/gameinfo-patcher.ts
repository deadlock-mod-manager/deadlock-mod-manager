import { invoke } from "@tauri-apps/api/core";
import disableModsPatch from "../../patches/disable-mods.patch.json";
import enableModsPatch from "../../patches/enable-mods.patch.json";

export interface PatchResult {
  success: boolean;
  error?: string;
}

export async function readGameinfo(): Promise<string> {
  return invoke<string>("read_gameinfo");
}

export async function applyEnableModsPatch(
  profile?: string,
): Promise<PatchResult> {
  try {
    await invoke("apply_gameinfo_patch", {
      patchJson: JSON.stringify(enableModsPatch),
      profile: profile ?? null,
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function applyDisableModsPatch(): Promise<PatchResult> {
  try {
    await invoke("apply_gameinfo_patch", {
      patchJson: JSON.stringify(disableModsPatch),
      profile: null,
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function enableMods(profile?: string): Promise<PatchResult> {
  return applyEnableModsPatch(profile);
}

export async function disableMods(): Promise<PatchResult> {
  return applyDisableModsPatch();
}
