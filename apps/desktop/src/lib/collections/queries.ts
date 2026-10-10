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

// Read from the local catalog, which the catalog sync keeps current.
export const COLLECTIONS_QUERY_KEY = ["collections"];

export const collectionsQueryOptions = () =>
  queryOptions({
    queryKey: COLLECTIONS_QUERY_KEY,
    queryFn: () =>
      invoke<CatalogCollectionDto[]>("list_gamebanana_collections"),
  });

/** The collection with its item remote ids, or null when the catalog doesn't have it. */
export const collectionQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [...COLLECTIONS_QUERY_KEY, id],
    queryFn: () =>
      invoke<CatalogCollectionDetailDto | null>("get_gamebanana_collection", {
        collectionId: id,
      }),
  });

/**
 * The collection's mods as the local catalog knows them, in collection order.
 * Items the catalog lacks (removed, or not synced yet) are left out. Kept under
 * the mods list key so catalog syncs refresh it and mod detail can read from it.
 */
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
