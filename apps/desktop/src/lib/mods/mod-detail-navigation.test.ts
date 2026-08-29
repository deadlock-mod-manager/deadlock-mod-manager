import { describe, expect, test } from "bun:test";
import {
  appendNavigation,
  type AuthorNavigationTarget,
  getBackNavigation,
  getCollectionNavigationTrail,
  getModsCollectionNavigationTrail,
  MAPS_STORE_NAVIGATION,
  MAPS_STORE_NAVIGATION_TRAIL,
  MODS_LIBRARY_NAVIGATION,
  MODS_LIBRARY_NAVIGATION_TRAIL,
  MODS_STORE_NAVIGATION,
  MODS_STORE_NAVIGATION_TRAIL,
} from "./mod-detail-navigation";

describe("mod detail navigation", () => {
  test("falls back to the mods store", () => {
    expect(getBackNavigation()).toEqual(MODS_STORE_NAVIGATION);
  });

  test("uses the last target as the immediate destination", () => {
    const author: AuthorNavigationTarget = {
      kind: "author",
      label: "bytenode",
      path: "/authors/author_123",
    };
    const trail = appendNavigation(MODS_LIBRARY_NAVIGATION_TRAIL, author);

    expect(getBackNavigation(trail)).toEqual(author);
  });

  test("preserves the collection when leaving a mod for its author", () => {
    const trail = appendNavigation(MODS_LIBRARY_NAVIGATION_TRAIL, {
      kind: "author",
      label: "bytenode",
      path: "/authors/author_123",
    });

    expect(getCollectionNavigationTrail(trail)).toEqual([
      MODS_LIBRARY_NAVIGATION,
    ]);
  });

  test("uses the maps collection for maps-only entry points", () => {
    const trail = getModsCollectionNavigationTrail(true);

    expect(trail).toEqual(MAPS_STORE_NAVIGATION_TRAIL);
    expect(getBackNavigation(trail)).toEqual(MAPS_STORE_NAVIGATION);
  });

  test("uses the mod store for standard entry points", () => {
    const trail = getModsCollectionNavigationTrail(false);

    expect(trail).toEqual(MODS_STORE_NAVIGATION_TRAIL);
    expect(getBackNavigation(trail)).toEqual(MODS_STORE_NAVIGATION);
  });
});
