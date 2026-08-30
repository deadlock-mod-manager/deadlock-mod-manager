import type {
  AnnouncementDto,
  CreateCrosshairDto,
  CustomSettingDto,
  FeatureFlag,
  FileserverDto,
  PublishedCrosshairDto,
  RelaysHealthResponse,
  ResolveModsResponse,
  ServerBrowserEntry,
  ServerBrowserFacetsResponse,
  ServerBrowserListInput,
  ServerBrowserListResponse,
  SharedProfile,
} from "@deadlock-mods/shared";
import { ensureValidToken } from "./auth/token";
import { fetch } from "./fetch";
import { HttpError } from "./http-error";
import logger from "./logger";
import {
  checkDirectGameBananaUpdates,
  getGameBananaCatalogDownloads,
  getGameBananaCatalogMod,
  getGameBananaCatalogMods,
  getDirectGameBananaFileservers,
} from "./gamebanana-catalog";

export const BASE_URL =
  import.meta.env.VITE_API_URL ?? "https://api.deadlockmods.app";

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
  return getGameBananaCatalogMods();
}; // TODO: pagination

export const getMod = async (remoteId: string) => {
  return getGameBananaCatalogMod(remoteId);
};

export const getModDownload = async (remoteId: string) => {
  return (await getGameBananaCatalogDownloads(remoteId)).downloads;
};

export const getModDownloads = async (remoteId: string) => {
  return getGameBananaCatalogDownloads(remoteId);
};

export const getGameBananaFileservers = async (): Promise<FileserverDto[]> => {
  return getDirectGameBananaFileservers();
};

export const checkModUpdates = async (
  mods: Array<{
    remoteId: string;
    installedAt: Date;
    selectedFileIds: string[];
  }>,
) => {
  return checkDirectGameBananaUpdates(
    mods.map((mod) => ({
      remoteId: mod.remoteId,
      installedAt: Math.floor(mod.installedAt.getTime() / 1_000),
      selectedFileIds: mod.selectedFileIds,
    })),
  );
};

export const getCustomSettings = async () => {
  return await apiRequest<CustomSettingDto[]>("/custom-settings");
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
