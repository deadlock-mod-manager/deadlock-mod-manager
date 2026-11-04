import type {
  AnnouncementDto,
  CreateCrosshairDto,
  CustomSettingDto,
  FeatureFlag,
  ModAuthorDto,
  ModDto,
  ProfileBackup,
  ProfileBackupSummary,
  PublishedCrosshairDto,
  ResolveModsResponse,
  SaveProfileBackupInput,
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
import { runtimeServiceOrigin } from "./runtime-bootstrap";
import {
  getNativeSourceMod,
  getNativeSourceRecord,
  isNativeSourceMod,
  listNativeSources,
  refreshNativeSource,
} from "./mod-sources";
import type { NativeSourceProvenance } from "@/types/generated/NativeSourceProvenance";
import type { ModUpdateCandidate } from "@/types/mods";
import {
  checkDirectGameBananaUpdates,
  getGameBananaCatalogDownloads,
  getGameBananaCatalogMod,
  getGameBananaCatalogMods,
} from "./gamebanana-catalog";

export const BASE_URL =
  import.meta.env.VITE_API_URL ?? "https://api.deadlockmods.app";

interface ModUpdatesResult {
  updates: Array<ModUpdateCandidate & { updatedAt: number }>;
  unknown: string[];
}

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
    response = await fetch(
      `${runtimeServiceOrigin("dmmApi", BASE_URL)}${endpoint}`,
      {
        method: method ?? (body ? "POST" : "GET"),
        headers,
        body: body ? JSON.stringify(body) : undefined,
        credentials: "include",
      },
    );
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

export const getMod = async (
  remoteId: string,
): Promise<ModDto & { source?: NativeSourceProvenance }> => {
  if (isNativeSourceMod(remoteId))
    return (await getNativeSourceMod(remoteId)).mod;
  return getGameBananaCatalogMod(remoteId);
};

export const getModAuthor = async (id: string) => {
  const profile = await apiRequest<{ author: ModAuthorDto; mods: ModDto[] }>(
    `/api/v2/mod-authors/${encodeURIComponent(id)}`,
  );
  // An API from before contacts existed leaves the field out.
  profile.author.contacts ??= [];
  if (profile.author.provider !== "gamebanana") return profile;
  const mods = await getGameBananaCatalogMods(profile.author.remoteId);
  return { ...profile, mods };
};

export const getModDownload = async (remoteId: string) => {
  if (isNativeSourceMod(remoteId))
    return (await getNativeSourceMod(remoteId)).downloads;
  return (await getGameBananaCatalogDownloads(remoteId)).downloads;
};

export const getModDownloads = async (remoteId: string) => {
  if (isNativeSourceMod(remoteId)) {
    const { downloads } = await getNativeSourceMod(remoteId);
    return { downloads, count: downloads.length };
  }
  return getGameBananaCatalogDownloads(remoteId);
};

export const checkModUpdates = async (
  mods: Array<{
    remoteId: string;
    // Persisted store dates come back from JSON as ISO strings.
    installedAt: Date | string;
    selectedFileIds: string[];
    selectedFileNames: string[];
    source?: NativeSourceProvenance;
  }>,
) => {
  const nativeMods = mods.filter((mod) => isNativeSourceMod(mod.remoteId));
  const legacy = mods.filter((mod) => !isNativeSourceMod(mod.remoteId));
  let gameBanana: ModUpdatesResult = { updates: [], unknown: [] };
  if (legacy.length) {
    try {
      gameBanana = await checkDirectGameBananaUpdates(
        legacy.map((mod) => ({
          remoteId: mod.remoteId,
          installedAt: Math.floor(new Date(mod.installedAt).getTime() / 1_000),
          selectedFileIds: mod.selectedFileIds,
          selectedFileNames: mod.selectedFileNames,
        })),
      );
    } catch (error) {
      if (!nativeMods.length) throw error;
      logger.withError(error).warn("GameBanana update check unavailable");
      gameBanana.unknown = legacy.map((mod) => mod.remoteId);
    }
  }
  if (!nativeMods.length) return gameBanana;
  const sources = await listNativeSources().catch((error: Error) => {
    logger.withError(error).warn("Native source update checks unavailable");
    return [];
  });
  const active = new Set(
    sources
      .filter((source) => source.enabled && !source.removed)
      .map((source) => source.key),
  );
  const refreshed = await Promise.allSettled(
    [
      ...new Set(
        nativeMods.flatMap((mod) =>
          mod.source && active.has(mod.source.sourceKey)
            ? [mod.source.sourceKey]
            : [],
        ),
      ),
    ].map((key) => refreshNativeSource(key)),
  );
  for (const result of refreshed) {
    if (result.status === "rejected")
      logger
        .withError(result.reason)
        .warn("Mod source refresh failed; keeping cached catalog");
  }
  const updates: Array<ModUpdateCandidate & { updatedAt: number }> = [
    ...gameBanana.updates,
  ];
  const unavailable: string[] = [];
  for (const installed of nativeMods) {
    if (!installed.source || !active.has(installed.source.sourceKey)) continue;
    try {
      const current = await getNativeSourceMod(installed.remoteId);
      if (
        current.source.releaseId === installed.source.releaseId &&
        current.source.contentRevision === installed.source.contentRevision
      )
        continue;
      if (!current.downloads.length) {
        unavailable.push(installed.remoteId);
        continue;
      }
      const record = await getNativeSourceRecord(installed.remoteId);
      updates.push({
        mod: current.mod,
        downloads: current.downloads,
        nativeInstallation: record.listing.release?.installation,
        updatedAt: Math.floor(Date.now() / 1_000),
      });
    } catch (error) {
      logger.withError(error).warn("Mod source update unavailable");
      unavailable.push(installed.remoteId);
    }
  }
  return { updates, unknown: [...gameBanana.unknown, ...unavailable] };
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

export const listProfileBackups = async () => {
  return await apiRequest<ProfileBackupSummary[]>("/api/v2/profile-backups");
};

export const getProfileBackup = async (id: string) => {
  return await apiRequest<ProfileBackup>(
    `/api/v2/profile-backups/${encodeURIComponent(id)}`,
  );
};

export const saveProfileBackup = async (input: SaveProfileBackupInput) => {
  return await apiRequest<ProfileBackupSummary>(
    "/api/v2/profile-backups",
    input,
    "PUT",
  );
};

export const deleteProfileBackup = async (id: string) => {
  return await apiRequest<{ success: boolean }>(
    `/api/v2/profile-backups/${encodeURIComponent(id)}`,
    undefined,
    "DELETE",
  );
};

export const getFeatureFlags = async () => {
  return await apiRequest<FeatureFlag[]>("/api/v2/feature-flags");
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
