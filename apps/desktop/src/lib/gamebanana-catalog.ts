import type { ModDto } from "@deadlock-mods/shared";
import { invoke } from "@tauri-apps/api/core";
import type { CatalogDownloadsDto } from "@/types/generated/CatalogDownloadsDto";
import type { CatalogModDto } from "@/types/generated/CatalogModDto";
import type { CatalogPageDto } from "@/types/generated/CatalogPageDto";
import type { CatalogQuery } from "@/types/generated/CatalogQuery";
import type { CatalogSyncStatusDto } from "@/types/generated/CatalogSyncStatusDto";
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
    downloads: result.downloads.map((download) => ({
      url: `gamebanana-file://${encodeURIComponent(remoteId)}/${download.fileId}`,
      size: download.size,
      name: download.name,
      description: download.description,
      createdAt: secondsToNullableDate(download.createdAt),
      updatedAt: secondsToNullableDate(download.updatedAt),
      md5Checksum: download.md5Checksum,
    })),
    count: result.count,
  };
};

export const inspectGameBananaCatalog = () =>
  invoke<CatalogSyncStatusDto>("inspect_gamebanana_catalog_state");

export const synchronizeGameBananaCatalog = () =>
  invoke<CatalogSyncStatusDto>("synchronize_gamebanana_catalog", {
    forceRefresh: false,
    forceReconcile: false,
  });

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

const secondsToDate = (value: number) => new Date(value * 1_000);

const secondsToNullableDate = (value: number | null) =>
  value === null ? null : secondsToDate(value);

const dependencyLevel = (value: string | null) => {
  if (value === "required" || value === "recommended") return value;
  return null;
};
