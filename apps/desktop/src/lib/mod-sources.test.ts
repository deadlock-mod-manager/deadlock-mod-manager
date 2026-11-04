import { describe, expect, test } from "bun:test";
import { buildTaxonomyDocument } from "@deadlock-mods/shared";
import type { ContentType } from "@/lib/store/slices/ui";
import type { NativeSourceListing } from "@/types/generated/NativeSourceListing";
import type { NativeSourceSummary } from "@/types/generated/NativeSourceSummary";
import {
  isNativeSourceImage,
  nativeListingMatchesContentType,
  nativeListingVisible,
  isNativeSourceMod,
  nativeModDownloads,
  toNativeModDto,
} from "./mod-sources";

const source: NativeSourceSummary = {
  key: "a".repeat(64),
  previewToken: "reviewed-descriptor",
  descriptorUrl: "https://mods.example/source.json",
  acceptedOrigin: "https://mods.example",
  enabled: true,
  removed: false,
  allowLocalNetwork: false,
  lastSync: null,
  lastError: null,
  listingCount: 1,
  descriptor: {
    format: "dmm-source",
    protocolVersion: "1.0",
    sourceId: "example",
    name: "Example mods",
    gameId: "deadlock",
    iconUrl: null,
    homepageUrl: null,
    catalog: { kind: "static", indexUrl: "https://mods.example/catalog.json" },
    networkOrigins: {
      api: ["https://mods.example"],
      downloads: ["https://mods.example"],
      media: [],
    },
    capabilities: null,
  },
};

const listing: NativeSourceListing = {
  remoteId: `source-${"b".repeat(64)}`,
  id: "mods/42",
  title: "Example",
  availability: "available",
  detailUrl: null,
  description: "An example mod",
  author: "Example author",
  hero: null,
  contentType: "mod",
  isNsfw: null,
  tags: [],
  images: [],
  homepageUrl: "https://mods.example/example",
  updatedAt: null,
  releaseUrl: null,
  release: {
    id: "release #1",
    contentRevision: "revision?2",
    version: null,
    artifacts: [
      {
        id: "asset/雪",
        filename: "example.vpk",
        format: "vpk",
        download: {
          url: "https://mods.example/temporary?token=expires",
          resolverUrl: null,
        },
        size: null,
        hashes: null,
      },
    ],
    installation: {
      mode: "manual",
      components: [],
      requiredComponents: [],
      choiceGroups: [],
    },
  },
};

describe("native source catalog and download boundary", () => {
  test("every published content type appears in exactly one browsing tab", () => {
    const tabs: ContentType[] = ["mod", "sound", "map", "wip", "collection"];
    for (const { id } of buildTaxonomyDocument().contentTypes) {
      const nativeListing = { ...listing, contentType: id };
      expect(
        tabs.filter((tab) =>
          nativeListingMatchesContentType(nativeListing, tab),
        ),
      ).toHaveLength(1);
    }
  });

  test.each([
    { contentType: "skins", tab: "mod" },
    { contentType: "gameplay", tab: "mod" },
    { contentType: "hud", tab: "mod" },
    { contentType: "models", tab: "mod" },
    { contentType: "other", tab: "mod" },
    { contentType: "music", tab: "sound" },
    { contentType: "ability-sounds", tab: "sound" },
    { contentType: "weapon-sounds", tab: "sound" },
    { contentType: "voice-lines", tab: "sound" },
    { contentType: "kill-sounds", tab: "sound" },
    { contentType: "killstreak-music", tab: "sound" },
    { contentType: "maps", tab: "map" },
  ] satisfies { contentType: string; tab: ContentType }[])(
    "$contentType listings use the $tab tab and matching mod flags",
    ({ contentType, tab }) => {
      const nativeListing = { ...listing, contentType };
      expect(nativeListingMatchesContentType(nativeListing, tab)).toBe(true);
      const mod = toNativeModDto(source, nativeListing);
      expect(mod.isAudio).toBe(tab === "sound");
      expect(mod.isMap).toBe(tab === "map");
    },
  );

  test("unrecognized content types are not assigned to a browsing tab", () => {
    const nativeListing = { ...listing, contentType: "unrecognized" };
    expect(nativeListingMatchesContentType(nativeListing, "mod")).toBe(false);
    expect(nativeListingMatchesContentType(nativeListing, "sound")).toBe(false);
    expect(nativeListingMatchesContentType(nativeListing, "map")).toBe(false);
    expect(toNativeModDto(source, nativeListing).isAudio).toBe(false);
    expect(toNativeModDto(source, nativeListing).isMap).toBe(false);
  });

  test("minimal sources without optional content type appear in Mods", () => {
    const minimalListing = { ...listing, contentType: null };
    expect(nativeListingMatchesContentType(minimalListing, "mod")).toBe(true);
    expect(nativeListingMatchesContentType(minimalListing, "sound")).toBe(
      false,
    );
    expect(nativeListingMatchesContentType(minimalListing, "map")).toBe(false);
    expect(nativeListingMatchesContentType(minimalListing, "wip")).toBe(false);
    expect(nativeListingMatchesContentType(minimalListing, "collection")).toBe(
      false,
    );
    expect(
      nativeListingMatchesContentType(
        { ...listing, contentType: "sound" },
        "mod",
      ),
    ).toBe(false);
    expect(
      nativeListingMatchesContentType(
        { ...listing, contentType: "sound" },
        "sound",
      ),
    ).toBe(true);
  });
  test("hiding adult content conservatively excludes unclassified source listings", () => {
    expect(nativeListingVisible(listing, true)).toBe(false);
    expect(nativeListingVisible({ ...listing, isNsfw: true }, true)).toBe(
      false,
    );
    expect(nativeListingVisible({ ...listing, isNsfw: false }, true)).toBe(
      true,
    );
    expect(nativeListingVisible(listing, false)).toBe(true);
  });
  test("native images cannot initiate frontend network requests", () => {
    expect(isNativeSourceImage("https://mods.example/image.png")).toBe(false);
    expect(isNativeSourceImage("data:image/svg+xml;base64,PHN2Zz4=")).toBe(
      false,
    );
    const cached = "data:image/png;base64,aW1hZ2U=";
    expect(
      toNativeModDto(source, {
        ...listing,
        images: ["https://mods.example/image.png", cached],
      }).images,
    ).toEqual([cached]);
  });
  test("native identities cannot be interpreted as GameBanana or local IDs", () => {
    expect(isNativeSourceMod(listing.remoteId)).toBe(true);
    for (const id of ["42", "snd-42", "wip-42", "local-42", "source-42"])
      expect(isNativeSourceMod(id)).toBe(false);
  });

  test("downloads pin source, listing, release, content and artifact, never an expiring URL", () => {
    const [file] = nativeModDownloads(source, listing);
    expect(file?.url).toBe(
      `dmm-source-file://${source.key}/mods%2F42/release%20%231/revision%3F2/asset%2F%E9%9B%AA`,
    );
    expect(file?.url).not.toContain("temporary");
    expect(file?.md5Checksum).toBeNull();
    expect(
      nativeModDownloads({ ...source, key: "c".repeat(64) }, listing)[0]?.url,
    ).not.toBe(file?.url);
  });

  test("metadata-only changes leave selected content references stable", () => {
    expect(
      nativeModDownloads(source, {
        ...listing,
        description: "Edited description",
        updatedAt: "2026-11-02T12:00:00Z",
      }),
    ).toEqual(nativeModDownloads(source, listing));
  });

  test("disabled and removed sources retain provenance without offering a new download", () => {
    for (const unavailable of [
      { ...source, enabled: false },
      { ...source, removed: true },
    ]) {
      expect(nativeModDownloads(unavailable, listing)).toEqual([]);
      const mod = toNativeModDto(unavailable, listing);
      expect(mod.downloadable).toBe(false);
      expect(mod.source.sourceKey).toBe(source.key);
      expect(mod.source.listingId).toBe(listing.id);
      expect(mod.source.releaseId).toBe("release #1");
      expect(mod.source.artifactIds).toEqual(["asset/雪"]);
    }
  });

  test("publisher-unavailable listings do not offer downloads", () => {
    expect(
      nativeModDownloads(source, { ...listing, availability: "removed" }),
    ).toEqual([]);
    expect(
      toNativeModDto(source, { ...listing, availability: "unavailable" })
        .downloadable,
    ).toBe(false);
  });
});
