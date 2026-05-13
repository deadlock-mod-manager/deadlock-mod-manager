import { invoke } from "@tauri-apps/api/core";
import type { AnalyzeAddonsResult } from "@/types/mods";
import { BASE_URL } from "./api-client";
import logger from "./logger";

export const initializeApiUrl = async (): Promise<void> => {
  try {
    await invoke("set_api_url", { apiUrl: BASE_URL });
  } catch (error) {
    logger.withError(error).error("Failed to set API URL in Rust backend");
  }
};

export const isGameRunning = async () => {
  return !!(await invoke("is_game_running"));
};

export const backupGameInfo = async () => {
  return await invoke("backup_gameinfo");
};

export const restoreGameInfoBackup = async () => {
  return await invoke("restore_gameinfo_backup");
};

export const resetToVanilla = async () => {
  return await invoke("reset_to_vanilla");
};

export const validateGameInfoPatch = async (expectedVanilla: boolean) => {
  return await invoke("validate_gameinfo_patch", { expectedVanilla });
};

export const getGameInfoStatus = async () => {
  return await invoke("get_gameinfo_status");
};

export const openGameInfoEditor = async () => {
  return await invoke("open_gameinfo_editor");
};

export const isAutoUpdateDisabled = async (): Promise<boolean> => {
  return await invoke("is_auto_update_disabled");
};

export const isFlatpak = async (): Promise<boolean> => {
  return await invoke("is_flatpak");
};

export const updateFlatpak = async (url: string): Promise<void> => {
  return await invoke("update_flatpak", { url });
};

export const analyzeLocalAddons = async (
  profileFolder: string | null = null,
): Promise<AnalyzeAddonsResult> => {
  return await invoke("analyze_local_addons", { profileFolder });
};

export const getProfileInstalledVpks = async (
  profileFolder: string | null = null,
): Promise<string[]> => {
  return await invoke("get_profile_installed_vpks", { profileFolder });
};

export const deleteProfileVpk = async (
  vpkName: string,
  profileFolder: string | null = null,
): Promise<void> => {
  return await invoke("delete_profile_vpk", { profileFolder, vpkName });
};

export const showProfileVpkInFolder = async (
  vpkName: string,
  profileFolder: string | null = null,
): Promise<void> => {
  return await invoke("show_profile_vpk_in_folder", {
    profileFolder,
    vpkName,
  });
};
