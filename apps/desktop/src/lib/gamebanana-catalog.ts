import type { ModDto } from "@deadlock-mods/shared";
import { invoke } from "@tauri-apps/api/core";
import type { CatalogDownloadsDto } from "@/types/generated/CatalogDownloadsDto";
import type { CatalogModDto } from "@/types/generated/CatalogModDto";
import type { CatalogPageDto } from "@/types/generated/CatalogPageDto";
import type { CatalogQuery } from "@/types/generated/CatalogQuery";
import type { CatalogSyncStatusDto } from "@/types/generated/CatalogSyncStatusDto";
import type { CatalogUpdatesDto } from "@/types/generated/CatalogUpdatesDto";
import type { GameBananaFileserverDto } from "@/types/generated/GameBananaFileserverDto";
import type { InstalledSubmissionDto } from "@/types/generated/InstalledSubmissionDto";
import type { FileserverDto } from "@deadlock-mods/shared";
import type { ModDownloadItem } from "@/types/mods";

export type DirectCatalogPage = {
  items: ModDto[];
  total: number;
  page: number;
  pageSize: number;
  stale: boolean;
};

let directClientEnabled = false;

export const setGameBananaDirectClientEnabled = (enabled: boolean) => {
  directClientEnabled = enabled;
};

export const isGameBananaDirectClientEnabled = () => directClientEnabled;

export const queryGameBananaCatalog = async (
  query: CatalogQuery,
): Promise<DirectCatalogPage> => {
  const result = await invoke<CatalogPageDto>("query_gamebanana_catalog", {
    query,
  });
  return {
    items: result.items.map(catalogModToModDto),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    stale: result.stale,
  };
};

export const getGameBananaCatalogMods = async (): Promise<ModDto[]> => {
  const page = await queryGameBananaCatalog({
    search: "",
    categories: [],
    heroes: [],
    excludeFilters: false,
    isAudio: null,
    isMap: null,
    hideNsfw: false,
    hideObsolete: false,
    updatedAfter: null,
    favorites: [],
    sort: "default",
    page: 0,
    pageSize: 5_000,
  });
  return page.items;
};

export const getGameBananaCatalogMod = async (
  remoteId: string,
): Promise<ModDto> => {
  const result = await invoke<CatalogModDto>(
    "get_gamebanana_submission_detail",
    { remoteId },
  );
  return catalogModToModDto(result);
};

export const getGameBananaCatalogDownloads = async (
  remoteId: string,
): Promise<{ downloads: ModDownloadItem[]; count: number }> => {
  const result = await invoke<CatalogDownloadsDto>(
    "get_gamebanana_submission_files",
    { remoteId },
  );
  return {
    downloads: result.downloads.map((download) =>
      catalogDownloadToModDownload(remoteId, download),
    ),
    count: result.count,
  };
};

const startupUpdateCheckJitter = new Promise<void>((resolve) => {
  globalThis.setTimeout(resolve, Math.floor(Math.random() * 10_000));
});

export const checkDirectGameBananaUpdates = async (
  submissions: InstalledSubmissionDto[],
) => {
  await startupUpdateCheckJitter;
  const result = await invoke<CatalogUpdatesDto>(
    "check_gamebanana_catalog_updates",
    { submissions },
  );
  return {
    updates: result.updates.map((update) => ({
      mod: catalogModToModDto(update.mod),
      downloads: update.downloads.map((download) =>
        catalogDownloadToModDownload(update.mod.remoteId, download),
      ),
    })),
    unknown: result.unknown,
  };
};

export const inspectGameBananaCatalog = () =>
  invoke<CatalogSyncStatusDto>("inspect_gamebanana_catalog_state");

export const synchronizeGameBananaCatalog = () =>
  invoke<CatalogSyncStatusDto>("synchronize_gamebanana_catalog", {
    forceRefresh: false,
    forceReconcile: false,
  });

export const getDirectGameBananaFileservers = async (): Promise<
  FileserverDto[]
> => {
  const servers = await invoke<GameBananaFileserverDto[]>(
    "get_gamebanana_fileservers",
    { forceRefresh: false },
  );
  return servers.map((server) => ({
    id: server.id,
    provider: server.provider,
    domain: server.domain,
    name: server.name,
    state:
      server.state === "up"
        ? "up"
        : server.state === "terminated"
          ? "terminated"
          : "down",
    urlTemplate: server.urlTemplate,
    stats: server.stats ?? undefined,
  }));
};

const catalogModToModDto = (mod: CatalogModDto): ModDto => ({
  id: mod.id,
  remoteId: mod.remoteId,
  name: mod.name,
  description: mod.description,
  remoteUrl: mod.remoteUrl,
  category: mod.category,
  likes: mod.likes,
  author: mod.author,
  downloadable: mod.downloadable,
  remoteAddedAt: secondsToDate(mod.remoteAddedAt),
  remoteUpdatedAt: secondsToDate(mod.remoteUpdatedAt),
  tags: mod.tags,
  images: mod.images,
  hero: mod.hero,
  isAudio: mod.isAudio,
  isMap: mod.isMap,
  audioUrl: mod.audioUrl,
  downloadCount: mod.downloadCount,
  isNSFW: mod.isNsfw,
  isObsolete: mod.isObsolete,
  isBlacklisted: false,
  blacklistReason: null,
  blacklistedAt: null,
  blacklistedBy: null,
  filesUpdatedAt: secondsToNullableDate(mod.filesUpdatedAt),
  metadata: mod.metadata
    ? {
        mapName: mod.metadata.mapName ?? undefined,
        donationLinks: mod.metadata.donationLinks,
      }
    : null,
  dependencies: mod.dependencies.map((dependency) => ({
    label: dependency.label,
    url: dependency.url,
    remoteId: dependency.remoteId,
    level: dependencyLevel(dependency.level),
  })),
  overrides: null,
  createdAt: secondsToNullableDate(mod.createdAt),
  updatedAt: secondsToNullableDate(mod.updatedAt),
});

const catalogDownloadToModDownload = (
  remoteId: string,
  download: CatalogDownloadsDto["downloads"][number],
): ModDownloadItem => ({
  url: `gamebanana-file://${encodeURIComponent(remoteId)}/${download.fileId}`,
  size: download.size,
  name: download.name,
  description: download.description,
  createdAt: secondsToNullableDate(download.createdAt),
  updatedAt: secondsToNullableDate(download.updatedAt),
  md5Checksum: download.md5Checksum,
});

const secondsToDate = (value: number) => new Date(value * 1_000);

const secondsToNullableDate = (value: number | null) =>
  value === null ? null : secondsToDate(value);

const dependencyLevel = (value: string | null) => {
  if (value === "required" || value === "recommended") return value;
  return null;
};
