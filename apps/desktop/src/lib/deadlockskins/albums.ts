import type { ModDto } from "@deadlock-mods/shared";
import { queryOptions } from "@tanstack/react-query";
import { fetch } from "@/lib/fetch";
import {
  CATALOG_QUERY_DEFAULTS,
  queryGameBananaCatalog,
} from "@/lib/gamebanana-catalog";
import { MODS_LIST_QUERY_KEY } from "@/lib/mods/mod-query-cache";
import { STALE_TIME_API } from "@/lib/query-constants";
import { type DeadlockSkinsAlbumMember, parseAlbumMembers } from "./parse";

// deadlockskins.gg has no public read API: its `/api/*` routes only serve
// signed-in album editing. The album pages are server-rendered, and each one
// carries its full member list as the JSON its own 1-click buttons use, so
// the HTML is the interface.
const DEADLOCKSKINS_ORIGIN = "https://deadlockskins.gg";

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

const fetchDocument = async (url: string): Promise<Document | null> => {
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`deadlockskins.gg returned HTTP ${response.status}`);
  }
  return new DOMParser().parseFromString(await response.text(), "text/html");
};

const text = (root: ParentNode, selector: string) =>
  root.querySelector(selector)?.textContent?.trim() ?? "";

const getAlbums = async (): Promise<DeadlockSkinsAlbum[]> => {
  const doc = await fetchDocument(`${DEADLOCKSKINS_ORIGIN}/albums`);
  return [
    ...(doc?.querySelectorAll('a.album-poster[href^="/albums/"]') ?? []),
  ].map((link) => ({
    slug: link.getAttribute("href")?.slice("/albums/".length) ?? "",
    name: text(link, ".name"),
    description: text(link, ".theme"),
    coverUrl: link.querySelector("img")?.getAttribute("src") ?? null,
    itemCount: Number.parseInt(text(link, ".chip"), 10) || 0,
  }));
};

/** The album's mods in album order, or null when deadlockskins.gg has no such album. */
const getAlbumMembers = async (
  slug: string,
): Promise<DeadlockSkinsAlbumMember[] | null> => {
  const doc = await fetchDocument(`${DEADLOCKSKINS_ORIGIN}${albumPath(slug)}`);
  if (!doc) return null;
  return parseAlbumMembers(
    doc.querySelector("[data-album-install]")?.getAttribute("data-members") ??
      "[]",
  );
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
