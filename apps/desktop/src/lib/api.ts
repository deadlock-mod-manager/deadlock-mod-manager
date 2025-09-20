import type {
  CustomSettingDto,
  ModDownloadDto,
  ModDto,
  SharedProfile,
} from "@deadlock-mods/shared";
import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:9000";

const apiRequest = async <T>(endpoint: string, body?: unknown): Promise<T> => {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
};

export const getMods = async () => {
  return await apiRequest<ModDto[]>("/api/v2/mods");
}; // TODO: pagination

export const getMod = async (remoteId: string) => {
  return await apiRequest<ModDto>(`/api/v2/mods/${remoteId}`);
};

export const getModDownload = async (remoteId: string) => {
  return await apiRequest<ModDownloadDto[]>(
    `/api/v2/mods/${remoteId}/download`,
  );
};

export const getModDownloads = async (remoteId: string) => {
  return await apiRequest<{
    downloads: ModDownloadDto;
    count: number;
  }>(`/api/v2/mods/${remoteId}/downloads`);
};

export const getCustomSettings = async () => {
  return await apiRequest<CustomSettingDto[]>("/custom-settings");
};

export const isGameRunning = async () => {
  return !!(await invoke("is_game_running"));
};

// Gameinfo.gi management functions
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

export const shareProfile = async (
  hardwareId: string,
  name: string,
  version: string,
  profile: SharedProfile,
) => {
  return await apiRequest<{
    id: string;
    status: "success" | "error";
    error?: string;
  }>(`/api/v2/profiles`, {
    hardwareId,
    name,
    version,
    profile,
  });
};

export const getProfile = async (profileId: string) => {
  return await apiRequest<SharedProfile>(`/api/v2/profiles/${profileId}`);
};
