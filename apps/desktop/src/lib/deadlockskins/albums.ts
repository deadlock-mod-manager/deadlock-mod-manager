import type { ModDto } from "@deadlock-mods/shared";
import { queryOptions } from "@tanstack/react-query";
import { fetch } from "@/lib/fetch";
import {
  CATALOG_QUERY_DEFAULTS,
  queryGameBananaCatalog,
} from "@/lib/gamebanana-catalog";
import { MODS_LIST_QUERY_KEY } from "@/lib/mods/mod-query-cache";
import { STALE_TIME_API } from "@/lib/query-constants";
import type { z } from "zod";
import {
  AlbumDetailResponseSchema,
  AlbumListResponseSchema,
  type DeadlockSkinsAlbumMember,
} from "./parse";

const DEADLOCKSKINS_ORIGIN = "https://deadlockskins.gg";
const ALBUMS_API = `${DEADLOCKSKINS_ORIGIN}/api/public/v1/albums`;

// Albums are hand-curated and change rarely.
const ALBUMS_STALE_TIME = 60 * 60 * 1000;

/** A deadlockskins.gg link to open in the browser, tagged so the site can attribute the visit. */
export const deadlockSkinsLink = (path: string) => {
  const url = new URL(path, DEADLOCKSKINS_ORIGIN);
  url.searchParams.set("ref", "dmm-app");
  return url.toString();
};

export const albumPageUrl = (slug: string) =>
  deadlockSkinsLink(`/albums/${encodeURIComponent(slug)}`);

/** The response body parsed by `schema`, or null on 404. */
const fetchApi = async <T extends z.ZodType>(
  url: string,
  schema: T,
): Promise<z.output<T> | null> => {
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`deadlockskins.gg returned HTTP ${response.status}`);
  }
  return schema.parse(await response.json());
};

const getAlbums = async () =>
  (await fetchApi(ALBUMS_API, AlbumListResponseSchema)) ?? [];

/** The album with its mods in album order, or null when deadlockskins.gg has no such album. */
const getAlbum = (slug: string) =>
  fetchApi(
    `${ALBUMS_API}/${encodeURIComponent(slug)}`,
    AlbumDetailResponseSchema,
  );

export const deadlockSkinsAlbumsQueryOptions = () =>
  queryOptions({
    queryKey: ["deadlockskins", "albums"],
    queryFn: getAlbums,
    staleTime: ALBUMS_STALE_TIME,
    retry: 2,
  });

export const deadlockSkinsAlbumQueryOptions = (slug: string) =>
  queryOptions({
    queryKey: ["deadlockskins", "album", slug],
    queryFn: () => getAlbum(slug),
    staleTime: ALBUMS_STALE_TIME,
    retry: 2,
  });

/**
 * The album's mods as the local catalog knows them, in album order. Members
 * the catalog lacks (removed, or not synced yet) are left out. Kept under the
 * mods list key so catalog syncs refresh it and mod detail can read from it.
 */
export const albumModsQueryOptions = (members: DeadlockSkinsAlbumMember[]) =>
  queryOptions({
    queryKey: [
      ...MODS_LIST_QUERY_KEY,
      "deadlockskins-album",
      members.map((member) => member.remoteId),
    ],
    queryFn: async (): Promise<ModDto[]> => {
      if (members.length === 0) return [];
      const page = await queryGameBananaCatalog({
        ...CATALOG_QUERY_DEFAULTS,
        favorites: members.map((member) => member.remoteId),
        includeWips: true,
      });
      const byRemoteId = new Map(page.items.map((mod) => [mod.remoteId, mod]));
      return members.flatMap((member) => byRemoteId.get(member.remoteId) ?? []);
    },
    staleTime: STALE_TIME_API,
  });
