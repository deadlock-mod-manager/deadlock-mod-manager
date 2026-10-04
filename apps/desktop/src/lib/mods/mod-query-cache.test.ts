import { describe, expect, it } from "bun:test";
import type { ModDto } from "@deadlock-mods/shared";
import { ModDtoSchema } from "@deadlock-mods/shared";
import { QueryClient } from "@tanstack/react-query";
import { findModInModsListCache, MODS_LIST_QUERY_KEY } from "./mod-query-cache";

function makeMod(remoteId: string): ModDto {
  const remoteUpdatedAt = new Date("2026-01-23T00:00:00.000Z");
  return ModDtoSchema.parse({
    id: remoteId,
    remoteId,
    name: `Mod ${remoteId}`,
    description: null,
    remoteUrl: "https://example.com",
    category: "test",
    likes: 0,
    author: "author",
    downloadable: true,
    remoteAddedAt: remoteUpdatedAt,
    remoteUpdatedAt,
    tags: [],
    images: [],
    hero: null,
    isAudio: false,
    isMap: false,
    audioUrl: null,
    downloadCount: 0,
    isNSFW: false,
    filesUpdatedAt: null,
    metadata: null,
    createdAt: null,
    updatedAt: null,
  });
}

describe("findModInModsListCache", () => {
  it("returns undefined when mods list is not cached", () => {
    const queryClient = new QueryClient();
    expect(findModInModsListCache(queryClient, "123")).toBeUndefined();
  });

  it("returns undefined when remote id is not in cached list", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(MODS_LIST_QUERY_KEY, [makeMod("111")]);
    expect(findModInModsListCache(queryClient, "222")).toBeUndefined();
  });

  it("returns the matching mod from cached list", () => {
    const queryClient = new QueryClient();
    const target = makeMod("222");
    queryClient.setQueryData(MODS_LIST_QUERY_KEY, [makeMod("111"), target]);
    expect(findModInModsListCache(queryClient, "222")).toEqual(target);
  });

  it("finds mods in paged catalog queries under the list key", () => {
    const queryClient = new QueryClient();
    const target = makeMod("333");
    queryClient.setQueryData([...MODS_LIST_QUERY_KEY, "gamebanana-direct"], {
      pages: [{ items: [makeMod("111")] }, { items: [target] }],
      pageParams: [0, 1],
    });
    queryClient.setQueryData([...MODS_LIST_QUERY_KEY, "single-page"], {
      items: [makeMod("444")],
    });
    expect(findModInModsListCache(queryClient, "333")).toEqual(target);
    expect(findModInModsListCache(queryClient, "444")?.remoteId).toBe("444");
  });
});
