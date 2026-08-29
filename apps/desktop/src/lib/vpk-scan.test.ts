import { describe, expect, it } from "bun:test";
import { findUnmatchedVpks } from "./vpk-scan";

describe("findUnmatchedVpks", () => {
  it("reports files no installed mod owns", () => {
    const unmatched = findUnmatchedVpks(
      ["pak01_dir.vpk", "stranger.vpk"],
      [{ remoteId: "123", installedVpks: ["pak01_dir.vpk"] }],
    );

    expect(unmatched).toEqual(["stranger.vpk"]);
  });

  // A mod pushed into an overflow shard is reported as `addons2/pak01_dir.vpk`
  // but records the bare name it owns inside that shard. Comparing the two
  // directly would offer every overflow mod for deletion.
  it("does not report enabled mods that live in an overflow shard", () => {
    const unmatched = findUnmatchedVpks(
      ["pak01_dir.vpk", "addons2/pak01_dir.vpk", "addons3/pak02_dir.vpk"],
      [
        { remoteId: "123", installedVpks: ["pak01_dir.vpk"] },
        { remoteId: "456", installedVpks: ["pak02_dir.vpk"] },
      ],
    );

    expect(unmatched).toEqual([]);
  });

  it("treats prefixed files as owned by the mod they are named after", () => {
    const unmatched = findUnmatchedVpks(
      ["123_original.vpk", "999_orphan.vpk"],
      [{ remoteId: "123", installedVpks: [] }],
    );

    expect(unmatched).toEqual(["999_orphan.vpk"]);
  });

  it("tolerates mods with no recorded VPKs", () => {
    const unmatched = findUnmatchedVpks(
      ["stranger.vpk"],
      [{ remoteId: "123" }, { remoteId: "456", installedVpks: null }],
    );

    expect(unmatched).toEqual(["stranger.vpk"]);
  });

  it("normalises backslash paths recorded by older installs", () => {
    const unmatched = findUnmatchedVpks(
      ["pak01_dir.vpk"],
      [{ remoteId: "123", installedVpks: ["addons\\pak01_dir.vpk"] }],
    );

    expect(unmatched).toEqual([]);
  });

  it("does not let malformed submission slugs claim prefixed files", () => {
    const unmatched = findUnmatchedVpks(
      ["01_original.vpk", "local-_original.vpk"],
      [
        { remoteId: "01", installedVpks: [] },
        { remoteId: "local-", installedVpks: [] },
      ],
    );

    expect(unmatched).toEqual(["01_original.vpk", "local-_original.vpk"]);
  });
});
