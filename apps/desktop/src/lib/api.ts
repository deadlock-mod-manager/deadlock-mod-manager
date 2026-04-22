import type {
  AnnouncementDto,
  CreateCrosshairDto,
  CustomSettingDto,
  FeatureFlag,
  FileserverDto,
  ModDto,
  PublishedCrosshairDto,
  RelaysHealthResponse,
  ResolveModsResponse,
  ServerBrowserEntry,
  ServerBrowserFacetsResponse,
  ServerBrowserListInput,
  ServerBrowserListResponse,
  SharedProfile,
} from "@deadlock-mods/shared";
import {
  FileserversResponseSchema,
  ModDownloadDtoSchema,
} from "@deadlock-mods/shared";
import { invoke } from "@tauri-apps/api/core";
import type { z } from "zod";
import type { AnalyzeAddonsResult } from "@/types/mods";
import { ensureValidToken } from "./auth/token";
import { fetch } from "./fetch";
import { HttpError } from "./http-error";
import logger from "./logger";

type ModDownloadDto = z.infer<typeof ModDownloadDtoSchema>;

const BASE_URL = import.meta.env.VITE_API_URL ?? "https://api.deadlockmods.app";

export const initializeApiUrl = async (): Promise<void> => {
  try {
    await invoke("set_api_url", { apiUrl: BASE_URL });
  } catch (error) {
    logger.withError(error).error("Failed to set API URL in Rust backend");
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

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, {
      method: method ?? (body ? "POST" : "GET"),
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
  } catch (cause) {
    logger.withError(cause).error("API network failure");
    throw new HttpError("backend", 0, endpoint);
  }

  if (!response.ok) {
    const errorText = await response.text();
    logger
      .withMetadata({ status: response.status, errorText })
      .error("API request failed");
    throw new HttpError("backend", response.status, endpoint);
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
    downloads: ModDownloadDto[];
    count: number;
  }>(`/api/v2/mods/${remoteId}/downloads`);
};

export const getGameBananaFileservers = async (): Promise<FileserverDto[]> => {
  const data = await apiRequest<unknown>("/api/v2/fileservers/gamebanana");
  return FileserversResponseSchema.parse(data);
};

export const checkModUpdates = async (
  mods: Array<{ remoteId: string; installedAt: Date }>,
) => {
  return await apiRequest<{
    updates: Array<{
      mod: ModDto;
      downloads: ModDownloadDto[];
    }>;
  }>("/api/v2/mods/check-updates", { mods });
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

export const isFlatpak = async (): Promise<boolean> => {
  return await invoke("is_flatpak");
};

export const updateFlatpak = async (url: string): Promise<void> => {
  return await invoke("update_flatpak", { url });
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

export const getServerFacets = async (): Promise<ServerBrowserFacetsResponse> =>
  apiRequest<ServerBrowserFacetsResponse>("/api/v2/servers/facets");

export const getServers = async (
  filters: ServerBrowserListInput = {},
): Promise<ServerBrowserListResponse> => {
  const params = new URLSearchParams();
  if (filters.game_mode) params.set("game_mode", filters.game_mode);
  if (typeof filters.has_players === "boolean")
    params.set("has_players", String(filters.has_players));
  if (filters.search) params.set("search", filters.search);
  if (filters.region) params.set("region", filters.region);
  if (typeof filters.password === "boolean")
    params.set("password", String(filters.password));
  if (typeof filters.limit === "number")
    params.set("limit", String(filters.limit));
  if (typeof filters.cursor === "number")
    params.set("cursor", String(filters.cursor));
  const qs = params.toString();
  return await apiRequest<ServerBrowserListResponse>(
    `/api/v2/servers${qs ? `?${qs}` : ""}`,
  );
};

export const getServer = async (id: string): Promise<ServerBrowserEntry> => {
  return await apiRequest<ServerBrowserEntry>(
    `/api/v2/servers/${encodeURIComponent(id)}`,
  );
};

export const getRelaysHealth = async (): Promise<RelaysHealthResponse> => {
  return await apiRequest<RelaysHealthResponse>("/api/v2/relays/health");
};

export const resolveServerMods = async (
  id: string,
): Promise<ResolveModsResponse> => {
  return await apiRequest<ResolveModsResponse>(
    `/api/v2/servers/${encodeURIComponent(id)}/resolve-mods`,
    undefined,
    "POST",
  );
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
