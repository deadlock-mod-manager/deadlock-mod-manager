import { describe, expect, test } from "bun:test";
import {
  type CollectionModDetailBackNavigation,
  resolveAuthorProfileBackNavigation,
} from "./mod-detail-navigation";

describe("resolveAuthorProfileBackNavigation", () => {
  test("preserves Mods Library across mod detail and author profile", () => {
    const libraryBackNavigation: CollectionModDetailBackNavigation = {
      kind: "library",
      path: "/my-mods",
    };

    expect(
      resolveAuthorProfileBackNavigation({
        backNavigation: libraryBackNavigation,
      }),
    ).toEqual(libraryBackNavigation);
  });

  test("preserves the parent collection after opening a mod from an author profile", () => {
    const libraryBackNavigation: CollectionModDetailBackNavigation = {
      kind: "library",
      path: "/my-mods",
    };

    expect(
      resolveAuthorProfileBackNavigation({
        backNavigation: {
          kind: "author",
          authorName: "bytenode",
          path: "/authors/123",
        },
        authorProfileBackNavigation: libraryBackNavigation,
      }),
    ).toEqual(libraryBackNavigation);
  });
});
