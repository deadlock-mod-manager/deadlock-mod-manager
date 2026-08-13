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
  DeadworksRegistryResponseSchema,
  FileserversResponseSchema,
  ModDownloadDtoSchema,
  normalizeDeadworksRegistryServers,
} from "@deadlock-mods/shared";
import type { z } from "zod";
import { ensureValidToken } from "./auth/token";
import { fetch } from "./fetch";
import { HttpError } from "./http-error";
import logger from "./logger";

type ModDownloadDto = z.infer<typeof ModDownloadDtoSchema>;

export const BASE_URL =
  import.meta.env.VITE_API_URL ?? "https://api.deadlockmods.app";

const DEADWORKS_REGISTRY_URL = "https://api.deadworks.net";

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

const REGISTRY_CACHE_MS = 10_000;
// The registry has gone fully down before (Cloudflare quota exhaustion returns
// 429 on every route). Polling it every 10s through an outage is pointless, so
// failures back off instead.
const REGISTRY_BACKOFF_MS = 60_000;
// How long a snapshot may still be shown once the registry is unreachable.
// Quota exhaustion lasts until the provider's daily reset, so a 30 minute
// window would expire mid-outage; the UI shows the snapshot's age so stale
// entries stay recognisable as such.
const REGISTRY_MAX_STALE_MS = 3 * 60 * 60_000;
const REGISTRY_SNAPSHOT_KEY = "deadworks-registry-snapshot";

export type DeadworksRegistryResult = {
  servers: ServerBrowserEntry[];
  /** True when these servers are a stale snapshot because the refresh failed. */
  degraded: boolean;
  /** Age of the served snapshot in ms, when it is a stale one. */
  snapshotAgeMs: number | null;
};

type RegistrySnapshot = {
  servers: ServerBrowserEntry[];
  fetchedAt: number;
};

let registryPromise: Promise<DeadworksRegistryResult> | null = null;
let registryCacheExpiresAt = 0;
let registrySnapshot: RegistrySnapshot | null = null;

const readPersistedSnapshot = (): RegistrySnapshot | null => {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(REGISTRY_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RegistrySnapshot;
    if (!Array.isArray(parsed?.servers) || typeof parsed.fetchedAt !== "number")
      return null;
    return parsed;
  } catch {
    return null;
  }
};

const persistSnapshot = (snapshot: RegistrySnapshot): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(REGISTRY_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch (error) {
    logger
      .withError(error)
      .warn("Could not persist Deadworks registry snapshot");
  }
};

/** The newest snapshot we're still willing to show, in-memory or from disk. */
const usableSnapshot = (): {
  servers: ServerBrowserEntry[];
  ageMs: number | null;
} => {
  const snapshot = registrySnapshot ?? readPersistedSnapshot();
  if (!snapshot) return { servers: [], ageMs: null };
  const ageMs = Date.now() - snapshot.fetchedAt;
  if (ageMs > REGISTRY_MAX_STALE_MS) return { servers: [], ageMs: null };
  registrySnapshot = snapshot;
  return { servers: snapshot.servers, ageMs };
};

const requestDeadworksRegistryServers = async (): Promise<
  ServerBrowserEntry[]
> => {
  const endpoint = `${DEADWORKS_REGISTRY_URL}/api/servers`;
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `Deadworks registry responded ${response.status} for ${endpoint}`,
    );
  }

  const payload = DeadworksRegistryResponseSchema.parse(await response.json());
  return normalizeDeadworksRegistryServers(payload, DEADWORKS_REGISTRY_URL);
};

/**
 * A failed refresh must not blank the browser: the last successful snapshot is
 * served instead, flagged as degraded so the UI can say why it may be stale.
 */
const loadDeadworksRegistryServers =
  async (): Promise<DeadworksRegistryResult> => {
    try {
      const servers = await requestDeadworksRegistryServers();
      registrySnapshot = { servers, fetchedAt: Date.now() };
      persistSnapshot(registrySnapshot);
      registryCacheExpiresAt = Date.now() + REGISTRY_CACHE_MS;
      return { servers, degraded: false, snapshotAgeMs: null };
    } catch (error) {
      logger.withError(error).warn("Deadworks registry request failed");
      registryCacheExpiresAt = Date.now() + REGISTRY_BACKOFF_MS;
      const { servers, ageMs } = usableSnapshot();
      return { servers, degraded: true, snapshotAgeMs: ageMs };
    }
  };

const fetchDeadworksRegistryServers = (): Promise<DeadworksRegistryResult> => {
  if (registryPromise && Date.now() < registryCacheExpiresAt) {
    return registryPromise;
  }

  // Claim the cache window up front so concurrent callers share this request;
  // the real expiry is set once the outcome is known.
  registryCacheExpiresAt = Date.now() + REGISTRY_CACHE_MS;
  registryPromise = loadDeadworksRegistryServers();
  return registryPromise;
};

export const getServerFacets =
  async (): Promise<ServerBrowserFacetsResponse> => {
    const apiFacets = await apiRequest<ServerBrowserFacetsResponse>(
      "/api/v2/servers/facets",
    );

    const { servers: registryServers } = await fetchDeadworksRegistryServers();
    const regions = Array.from(
      new Set([
        ...apiFacets.regions,
        ...registryServers
          .map((server) => server.source_region ?? "")
          .filter(Boolean),
      ]),
    ).sort();
    return { ...apiFacets, regions };
  };

const filterServerBrowserEntries = (
  servers: ServerBrowserEntry[],
  filters: ServerBrowserListInput,
): ServerBrowserEntry[] => {
  let filtered = servers;

  if (filters.search) {
    const search = filters.search.toLowerCase();
    filtered = filtered.filter(
      (server) =>
        server.name.toLowerCase().includes(search) ||
        server.map.toLowerCase().includes(search) ||
        server.game_mode.toLowerCase().includes(search),
    );
  }
  if (filters.region) {
    const region = filters.region.toLowerCase();
    filtered = filtered.filter(
      (server) => server.source_region?.toLowerCase() === region,
    );
  }
  if (filters.game_mode) {
    const gameMode = filters.game_mode.toLowerCase();
    filtered = filtered.filter(
      (server) => server.game_mode.toLowerCase() === gameMode,
    );
  }
  if (filters.has_players) {
    filtered = filtered.filter((server) => server.player_count > 0);
  }
  if (typeof filters.password === "boolean") {
    filtered = filtered.filter(
      (server) => server.password_protected === filters.password,
    );
  }

  return [...filtered].sort((left, right) => {
    if (left.player_count !== right.player_count) {
      return right.player_count - left.player_count;
    }
    return left.name.localeCompare(right.name);
  });
};

export type ServerBrowserListResult = ServerBrowserListResponse & {
  /** The Deadworks registry couldn't be refreshed; its servers may be stale. */
  registry_degraded: boolean;
  /** Age of the stale registry snapshot in ms, if one is being shown. */
  registry_snapshot_age_ms: number | null;
};

export const getServers = async (
  filters: ServerBrowserListInput = {},
): Promise<ServerBrowserListResult> => {
  const params = new URLSearchParams();
  if (filters.game_mode) params.set("game_mode", filters.game_mode);
  if (typeof filters.has_players === "boolean")
    params.set("has_players", String(filters.has_players));
  if (filters.search) params.set("search", filters.search);
  if (filters.region) params.set("region", filters.region);
  if (typeof filters.password === "boolean")
    params.set("password", String(filters.password));
  params.set("limit", "500");
  const qs = params.toString();
  const apiResponse = await apiRequest<ServerBrowserListResponse>(
    `/api/v2/servers${qs ? `?${qs}` : ""}`,
  );

  const {
    servers: registryServers,
    degraded: registryDegraded,
    snapshotAgeMs,
  } = await fetchDeadworksRegistryServers();

  const deduplicated = new Map<string, ServerBrowserEntry>();
  for (const server of [...apiResponse.servers, ...registryServers]) {
    const existing = deduplicated.get(server.id);
    if (
      !existing ||
      new Date(server.last_seen).getTime() >
        new Date(existing.last_seen).getTime()
    ) {
      deduplicated.set(server.id, server);
    }
  }

  const filtered = filterServerBrowserEntries(
    Array.from(deduplicated.values()),
    filters,
  );
  const cursor = filters.cursor ?? 0;
  const limit = filters.limit ?? 100;
  const nextCursor = cursor + limit < filtered.length ? cursor + limit : null;

  return {
    ...apiResponse,
    servers: filtered.slice(cursor, cursor + limit),
    total: filtered.length,
    cursor: nextCursor,
    registry_degraded: registryDegraded,
    registry_snapshot_age_ms: snapshotAgeMs,
  };
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
