import type {
  CustomSettingDto,
  ModDownloadDto,
  ModDto,
  SharedProfile,
} from "@deadlock-mods/shared";
import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import type {
  AnalyzeAddonsResult,
  ModIdentificationRequest,
  ModIdentificationResponse,
} from "@/types/mods";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:9000";

export const initializeApiUrl = async (): Promise<void> => {
  try {
    await invoke("set_api_url", { apiUrl: BASE_URL });
  } catch (error) {
    console.error("Failed to set API URL in Rust backend:", error);
  }
};

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

export const getFeatureFlags = async () => {
  return await apiRequest<Array<{ name: string; enabled: boolean }>>(
    "/api/v2/feature-flags",
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

// Local addon analysis functions
export const analyzeLocalAddons = async (): Promise<AnalyzeAddonsResult> => {
  return await invoke("analyze_local_addons");
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

// Stub for mod identification endpoint (to be implemented later)
export const identifyMod = async (
  request: ModIdentificationRequest,
): Promise<ModIdentificationResponse> => {
  // TODO: Implement the actual API endpoint
  // For now, return a stub response
  console.log("Identifying mod with request:", request);

  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Return stub response
  return {
    remoteId: undefined,
    confidence: 0,
    modName: "Unknown Mod",
    modAuthor: "Unknown Author",
  };
};
