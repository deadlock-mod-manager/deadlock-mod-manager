import type { ModDto } from "@deadlock-mods/shared";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";
import { fetch } from "@/lib/fetch";
import {
  CATALOG_QUERY_DEFAULTS,
  queryGameBananaCatalog,
} from "@/lib/gamebanana-catalog";
import { MODS_LIST_QUERY_KEY } from "@/lib/mods/mod-query-cache";
import { STALE_TIME_API } from "@/lib/query-constants";
import {
  AlbumListResponseSchema,
  AlbumResponseSchema,
  type DeadlockSkinsAlbumMember,
  parseAlbumMembers,
} from "./parse";

const DEADLOCKSKINS_ORIGIN = "https://deadlockskins.gg";
const DEADLOCKSKINS_API = `${DEADLOCKSKINS_ORIGIN}/api/public/v1`;

// Albums are hand-curated and change rarely.
const ALBUMS_STALE_TIME = 60 * 60 * 1000;

export type DeadlockSkinsAlbum = {
  slug: string;
  name: string;
  description: string;
  coverUrl: string | null;
  itemCount: number;
};

const albumPath = (slug: string) => `/albums/${encodeURIComponent(slug)}`;

/** A deadlockskins.gg link to open in the browser, tagged so the site can attribute the visit. */
export const deadlockSkinsLink = (path: string) =>
  `${DEADLOCKSKINS_ORIGIN}${path}?ref=dmm`;

export const albumPageUrl = (slug: string) =>
  deadlockSkinsLink(albumPath(slug));

const fetchJson = async <T>(
  url: string,
  schema: z.ZodType<T>,
): Promise<T | null> => {
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`deadlockskins.gg returned HTTP ${response.status}`);
  }
  return schema.parse(await response.json());
};

const getAlbums = async (): Promise<DeadlockSkinsAlbum[]> => {
  const response = await fetchJson(
    `${DEADLOCKSKINS_API}/albums`,
    AlbumListResponseSchema,
  );
  return (response?.albums ?? []).map((album) => ({
    slug: album.slug,
    name: album.title,
    description: album.description ?? "",
    coverUrl: album.coverUrl ?? null,
    itemCount: album.itemCount,
  }));
};

/** The album's mods in album order, or null when deadlockskins.gg has no such album. */
const getAlbumMembers = async (
  slug: string,
): Promise<DeadlockSkinsAlbumMember[] | null> => {
  const response = await fetchJson(
    `${DEADLOCKSKINS_API}/albums/${encodeURIComponent(slug)}`,
    AlbumResponseSchema,
  );
  return response && parseAlbumMembers(response);
};

export const deadlockSkinsAlbumsQueryOptions = () =>
  queryOptions({
    queryKey: ["deadlockskins", "albums"],
    queryFn: getAlbums,
    staleTime: ALBUMS_STALE_TIME,
    retry: 2,
  });

export const deadlockSkinsAlbumMembersQueryOptions = (slug: string) =>
  queryOptions({
    queryKey: ["deadlockskins", "album", slug],
    queryFn: () => getAlbumMembers(slug),
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
