import { describe, expect, it } from "bun:test";
import type {
  ProfileVpkFile,
  VpkManifest,
  VpkManifestEntry,
} from "@/types/profiles";
import { findUnmatchedVpks } from "./vpk-scan";

const file = (locator: string): ProfileVpkFile => {
  const [root, filename] = locator.includes("/")
    ? locator.split("/")
    : ["addons", locator];
  return { shard: Number(root.slice(6) || 1), filename, locator };
};
const files = (...locators: string[]) => locators.map(file);
const enabled = (shard: number, ...vpks: string[]): VpkManifestEntry => ({
  enabled: true,
  shard,
  currentVpks: vpks,
  disabledVpks: [],
  originalVpkNames: vpks,
});
const disabled = (...vpks: string[]): VpkManifestEntry => ({
  enabled: false,
  shard: 1,
  currentVpks: [],
  disabledVpks: vpks,
  originalVpkNames: vpks,
});
const manifest = (
  mods: Record<string, VpkManifestEntry> = {},
): VpkManifest => ({
  version: 3,
  mods,
});

describe("findUnmatchedVpks", () => {
  it("matches local UUID ownership across accepted casing differences", () => {
    const lower = "local-550e8400-e29b-41d4-a716-446655440000";
    const upper = "local-550E8400-E29B-41D4-A716-446655440000";
    expect(
      findUnmatchedVpks(files(`${upper}_original.vpk`), manifest(), [
        { remoteId: lower },
      ]),
    ).toEqual([]);
    expect(
      findUnmatchedVpks(files(`${lower}_original.vpk`), manifest(), [
        { remoteId: upper },
      ]),
    ).toEqual([]);
  });

  it("reports files no installed mod owns", () => {
    const unmatched = findUnmatchedVpks(
      files("pak01_dir.vpk", "stranger.vpk"),
      manifest({ "123": enabled(1, "pak01_dir.vpk") }),
      [{ remoteId: "123", installedVpks: ["pak01_dir.vpk"] }],
    );

    expect(unmatched).toEqual(["stranger.vpk"]);
  });

  // Every shard numbers its files from pak01, so a bare filename cannot say
  // which mod a file belongs to.
  it("matches enabled mods in the shard the manifest records", () => {
    const unmatched = findUnmatchedVpks(
      files("pak01_dir.vpk", "addons2/pak01_dir.vpk", "addons3/pak02_dir.vpk"),
      manifest({
        "123": enabled(1, "pak01_dir.vpk"),
        "456": enabled(2, "pak01_dir.vpk"),
        "789": enabled(3, "pak02_dir.vpk"),
      }),
      [
        { remoteId: "123", installedVpks: ["pak01_dir.vpk"] },
        { remoteId: "456", installedVpks: ["pak01_dir.vpk"] },
        { remoteId: "789", installedVpks: ["pak02_dir.vpk"] },
      ],
    );

    expect(unmatched).toEqual([]);
  });

  it("reports a stray overflow file that shares a name with a base mod", () => {
    const unmatched = findUnmatchedVpks(
      files("pak09_dir.vpk", "addons2/pak01_dir.vpk", "addons2/pak09_dir.vpk"),
      manifest({
        "123": enabled(1, "pak09_dir.vpk"),
        "456": enabled(2, "pak01_dir.vpk"),
      }),
      [
        { remoteId: "123", installedVpks: ["pak09_dir.vpk"] },
        { remoteId: "456", installedVpks: ["pak01_dir.vpk"] },
      ],
    );

    expect(unmatched).toEqual(["addons2/pak09_dir.vpk"]);
  });

  it("reports the slot a mod left when it moved to another shard", () => {
    const unmatched = findUnmatchedVpks(
      files("pak04_dir.vpk", "addons2/pak02_dir.vpk"),
      manifest({ "123": enabled(2, "pak02_dir.vpk") }),
      [{ remoteId: "123", installedVpks: ["pak04_dir.vpk"] }],
    );

    expect(unmatched).toEqual(["pak04_dir.vpk"]);
  });

  it("treats disabled copies as owned by their mod", () => {
    const unmatched = findUnmatchedVpks(
      files("parked.vpk", "addons2/parked.vpk"),
      manifest({ "123": disabled("parked.vpk") }),
      [{ remoteId: "123", installedVpks: [] }],
    );

    expect(unmatched).toEqual(["addons2/parked.vpk"]);
  });

  it("ignores manifest entries for mods missing from the library", () => {
    const unmatched = findUnmatchedVpks(
      files("pak01_dir.vpk"),
      manifest({ "123": enabled(1, "pak01_dir.vpk") }),
      [],
    );

    expect(unmatched).toEqual(["pak01_dir.vpk"]);
  });

  it("treats prefixed files as owned by the mod they are named after", () => {
    const unmatched = findUnmatchedVpks(
      files("123_original.vpk", "999_orphan.vpk"),
      manifest(),
      [{ remoteId: "123", installedVpks: [] }],
    );

    expect(unmatched).toEqual(["999_orphan.vpk"]);
  });

  it("tolerates mods with no recorded VPKs", () => {
    const unmatched = findUnmatchedVpks(files("stranger.vpk"), manifest(), [
      { remoteId: "123" },
      { remoteId: "456", installedVpks: null },
    ]);

    expect(unmatched).toEqual(["stranger.vpk"]);
  });

  it("falls back to base-folder names for mods the manifest does not know", () => {
    const unmatched = findUnmatchedVpks(
      files("pak01_dir.vpk", "addons2/pak01_dir.vpk"),
      manifest(),
      [{ remoteId: "123", installedVpks: ["addons\\pak01_dir.vpk"] }],
    );

    expect(unmatched).toEqual(["addons2/pak01_dir.vpk"]);
  });

  it("does not let malformed submission slugs claim prefixed files", () => {
    const unmatched = findUnmatchedVpks(
      files("01_original.vpk", "local-_original.vpk"),
      manifest(),
      [
        { remoteId: "01", installedVpks: [] },
        { remoteId: "local-", installedVpks: [] },
      ],
    );

    expect(unmatched).toEqual(["01_original.vpk", "local-_original.vpk"]);
  });
});
