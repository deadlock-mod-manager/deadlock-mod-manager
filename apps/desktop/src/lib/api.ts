import type {
  AnnouncementDto,
  CreateCrosshairDto,
  CustomSettingDto,
  FeatureFlag,
  ModDownloadDto,
  ModDto,
  PublishedCrosshairDto,
  SharedProfile,
} from "@deadlock-mods/shared";
import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import type { AnalyzeAddonsResult } from "@/types/mods";
import { ensureValidToken } from "./auth/token";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:9000";

export const initializeApiUrl = async (): Promise<void> => {
  try {
    await invoke("set_api_url", { apiUrl: BASE_URL });
  } catch (error) {
    console.error("Failed to set API URL in Rust backend:", error);
  }
};

const apiRequest = async <T>(
  endpoint: string,
  body?: unknown,
  method?: string,
): Promise<T> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const accessToken = await ensureValidToken();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: method ?? (body ? "POST" : "GET"),
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[API] Error ${response.status}:`, errorText);
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
};

export const getAnnouncements = async () => {
  return await apiRequest<AnnouncementDto[]>("/api/v2/announcements");
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

// Auto-update management functions
export const isAutoUpdateDisabled = async (): Promise<boolean> => {
  return await invoke("is_auto_update_disabled");
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

export const getFeatureFlags = async () => {
  return await apiRequest<FeatureFlag[]>("/api/v2/feature-flags");
};

export const setFeatureFlagUserOverride = async (
  flagId: string,
  value: unknown,
) => {
  return await apiRequest<{ success: boolean }>(
    `/api/v2/feature-flags/${flagId}/user-override`,
    { flagId, value },
    "PUT",
  );
};

export const deleteFeatureFlagUserOverride = async (flagId: string) => {
  return await apiRequest<{ success: boolean }>(
    `/api/v2/feature-flags/${flagId}/user-override`,
    { flagId },
    "DELETE",
  );
};
export const getApiHealth = async () => {
  return await apiRequest<{
    status: string;
    db: { alive: boolean };
    redis: { alive: boolean; configured: boolean };
    version: string;
    spec: string;
  }>("/");
};

export const getCrosshairs = async () => {
  return await apiRequest<PublishedCrosshairDto[]>("/api/v2/crosshairs");
};

export const getCrosshair = async (id: string) => {
  return await apiRequest<PublishedCrosshairDto>(`/api/v2/crosshairs/${id}`);
};

export const publishCrosshair = async (data: CreateCrosshairDto) => {
  return await apiRequest<PublishedCrosshairDto>("/api/v2/crosshairs", data);
};

export const incrementCrosshairDownload = async (id: string) => {
  return await apiRequest<PublishedCrosshairDto>(
    `/api/v2/crosshairs/${id}/download`,
    {},
    "POST",
  );
};

export const toggleCrosshairLike = async (id: string) => {
  return await apiRequest<{ likes: number; hasLiked: boolean }>(
    `/api/v2/crosshairs/${id}/like`,
    {},
    "POST",
  );
};

// Local addon analysis functions
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

// Hash analysis for mod identification
export const analyzeHashes = async (hashes: {
  sha256?: string;
  contentSignature: string;
  fastHash?: string;
  fileSize?: number;
  merkleRoot?: string;
}) => {
  return await apiRequest<
    Array<{
      matchedVpk: {
        id: string;
        mod: {
          id: string;
          name: string;
          author: string;
        };
      };
      match: {
        certainty: number;
        matchType:
          | "sha256"
          | "contentSignature"
          | "fastHashAndSize"
          | "merkleRoot";
        alternativeMatches?: Array<{
          id: string;
          mod: {
            id: string;
            name: string;
            author: string;
          };
        }>;
      };
    }>
  >("/api/v2/vpk-analyse-hashes", hashes);
};
