import { describe, expect, it } from "bun:test";
import type { ModFileTree } from "@/types/mods";
import type { VpkManifest } from "@/types/profiles";
import { previousInstallSelection } from "./mod-variants";

const selection: ModFileTree = {
  files: [
    {
      name: "base.vpk",
      path: "mod.zip/base.vpk",
      size: 93,
      is_selected: true,
      archive_name: "mod.zip",
    },
    {
      name: "optional.vpk",
      path: "mod.zip/optional.vpk",
      size: 97,
      is_selected: false,
      archive_name: "mod.zip",
    },
  ],
  total_files: 2,
  has_multiple_files: true,
};
const downloaded = {
  remoteId: "42",
  installedVpks: [],
  installedFileTree: selection,
};
const emptyManifest: VpkManifest = { version: 3, mods: {} };

describe("previousInstallSelection", () => {
  it("preserves the selected and deselected files after disabled VPKs are reconciled", () => {
    const manifest: VpkManifest = {
      version: 3,
      mods: {
        "42": {
          enabled: false,
          shard: 1,
          currentVpks: [],
          disabledVpks: ["42_base.vpk"],
          originalVpkNames: ["base.vpk"],
        },
      },
    };
    expect(previousInstallSelection(downloaded, manifest)).toEqual(selection);
  });

  it("still asks for a selection on the first install", () => {
    expect(previousInstallSelection(downloaded, emptyManifest)).toBeUndefined();
  });

  it("preserves legacy selections before reconciliation clears the VPK locators", () => {
    const installed = { ...downloaded, installedVpks: ["pak01_dir.vpk"] };
    expect(previousInstallSelection(installed, emptyManifest)).toEqual(
      selection,
    );
    expect(previousInstallSelection(installed)).toEqual(selection);
  });
});
