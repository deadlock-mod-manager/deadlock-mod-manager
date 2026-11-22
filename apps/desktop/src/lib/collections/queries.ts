import type { ModDto } from "@deadlock-mods/shared";
import { queryOptions } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
  CATALOG_QUERY_DEFAULTS,
  queryGameBananaCatalog,
} from "@/lib/gamebanana-catalog";
import { MODS_LIST_QUERY_KEY } from "@/lib/mods/mod-query-cache";
import type { CatalogCollectionDetailDto } from "@/types/generated/CatalogCollectionDetailDto";
import type { CatalogCollectionDto } from "@/types/generated/CatalogCollectionDto";

export const COLLECTIONS_QUERY_KEY = ["collections"];

export const collectionsQueryOptions = () =>
  queryOptions({
    queryKey: COLLECTIONS_QUERY_KEY,
    queryFn: () =>
      invoke<CatalogCollectionDto[]>("list_gamebanana_collections"),
  });

export const collectionQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [...COLLECTIONS_QUERY_KEY, id],
    queryFn: () =>
      invoke<CatalogCollectionDetailDto | null>("get_gamebanana_collection", {
        collectionId: id,
      }),
  });

export const collectionModsQueryOptions = (remoteIds: string[]) =>
  queryOptions({
    queryKey: [...MODS_LIST_QUERY_KEY, "collection", remoteIds],
    queryFn: async (): Promise<ModDto[]> => {
      if (remoteIds.length === 0) return [];
      const page = await queryGameBananaCatalog({
        ...CATALOG_QUERY_DEFAULTS,
        favorites: remoteIds,
        includeWips: true,
      });
      const byRemoteId = new Map(page.items.map((mod) => [mod.remoteId, mod]));
      return remoteIds.flatMap((remoteId) => byRemoteId.get(remoteId) ?? []);
    },
  });
