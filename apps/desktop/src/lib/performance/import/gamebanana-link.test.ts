import { describe, expect, test } from "bun:test";
import type { CatalogDownloadDto } from "@/types/generated/CatalogDownloadDto";
import {
  defaultGameBananaFile,
  parseGameBananaLink,
  sortGameBananaFiles,
} from "./gamebanana-link";

describe("parseGameBananaLink", () => {
  test("reads a mod page link", () => {
    expect(parseGameBananaLink("https://gamebanana.com/mods/656341")).toEqual({
      modId: 656341,
      fileId: null,
    });
  });

  test("accepts www, no scheme, trailing slash and query", () => {
    expect(
      parseGameBananaLink("www.gamebanana.com/mods/690233/?tab=files"),
    ).toEqual({ modId: 690233, fileId: null });
  });

  test("reads the file id from a download page link", () => {
    expect(
      parseGameBananaLink(
        "https://gamebanana.com/mods/download/616141#FileInfo_1428893",
      ),
    ).toEqual({ modId: 616141, fileId: 1428893 });
  });

  test("accepts a bare mod id", () => {
    expect(parseGameBananaLink(" 678180 ")).toEqual({
      modId: 678180,
      fileId: null,
    });
  });

  test("rejects other sites, other sections and direct file links", () => {
    expect(parseGameBananaLink("https://example.com/mods/656341")).toBeNull();
    expect(parseGameBananaLink("https://gamebanana.com/sounds/1")).toBeNull();
    expect(parseGameBananaLink("https://gamebanana.com/dl/1428893")).toBeNull();
    expect(parseGameBananaLink("not a link")).toBeNull();
  });
});

const file = (
  fileId: string,
  createdAt: number | null,
  isArchived = false,
): CatalogDownloadDto => ({
  fileId,
  size: 1,
  name: `${fileId}.zip`,
  description: null,
  createdAt,
  updatedAt: createdAt,
  md5Checksum: null,
  isArchived,
});

describe("GameBanana file choice", () => {
  const files = [
    file("old", 100),
    file("superseded", 300, true),
    file("new", 200),
  ];

  test("lists current files newest first, superseded files last", () => {
    expect(sortGameBananaFiles(files).map((entry) => entry.fileId)).toEqual([
      "new",
      "old",
      "superseded",
    ]);
  });

  test("prefers the file the link names", () => {
    expect(defaultGameBananaFile([file("42", 1), file("43", 2)], 42)).toBe(
      "42",
    );
  });

  test("falls back to the newest current file", () => {
    expect(defaultGameBananaFile(files, 999)).toBe("new");
    expect(defaultGameBananaFile([], null)).toBeNull();
  });
});
