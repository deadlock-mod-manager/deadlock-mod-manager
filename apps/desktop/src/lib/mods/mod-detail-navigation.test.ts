import { describe, expect, test } from "bun:test";
import {
  getBackNavigation,
  type ModDetailNavigationState,
  type ModsCollection,
} from "./mod-detail-navigation";

describe("mod detail navigation", () => {
  test("falls back to the mods store for direct links", () => {
    expect(getBackNavigation()).toMatchObject({
      path: "/mods",
      state: { collection: "mods" },
    });
  });

  const collections: { collection: ModsCollection; path: string }[] = [
    { collection: "mods", path: "/mods" },
    { collection: "maps", path: "/maps" },
    { collection: "library", path: "/my-mods" },
    { collection: "favorites", path: "/favorites" },
    { collection: "dashboard", path: "/" },
  ];

  test.each(collections)(
    "preserves $collection through collection → author → mod → author → collection",
    ({ collection, path }) => {
      const state: ModDetailNavigationState = {
        collection,
        author: { id: "gamebanana:123", name: "bytenode" },
      };
      const backToAuthor = getBackNavigation(state);

      expect(backToAuthor).toEqual({
        path: "/authors/gamebanana:123",
        labelKey: "modDetail.backToAuthorMods",
        labelValues: { author: "bytenode" },
        state: { collection },
      });
      expect(getBackNavigation(backToAuthor.state).path).toBe(path);
      expect(getBackNavigation({ collection }).path).toBe(path);
    },
  );
});
