import { describe, expect, it } from "bun:test";
import type { ModdingArchiveEntry } from "@/types/generated/ModdingArchiveEntry";
import {
  archiveSelectionPayload,
  assetSelectionCount,
  assetSelectionState,
  selectArchiveAsset,
} from "./modding-asset-selection";

const node = (
  path: string,
  fileCount: number,
  directory = true,
): ModdingArchiveEntry => ({
  path,
  name: path,
  directory,
  fileCount,
  size: BigInt(0),
});

describe("archive checkbox selection", () => {
  it("selects folders recursively and represents exclusions as partial parents", () => {
    const folder = node("models/haze", 3);
    const file = node("models/haze/hat.vmdl_c", 1, false);
    let selection = selectArchiveAsset(new Map(), folder, true);
    expect(assetSelectionState(selection, file)).toBe(true);
    selection = selectArchiveAsset(selection, file, false);
    expect(assetSelectionCount(selection)).toBe(2);
    expect(assetSelectionState(selection, folder)).toBe("indeterminate");
    expect(assetSelectionState(selection, node("models/hazel", 2))).toBe(false);
    selection = selectArchiveAsset(selection, file, true);
    expect(selection.size).toBe(1);
    expect(assetSelectionState(selection, folder)).toBe(true);
  });
  it("recognizes a folder selected through all its individual files", () => {
    const folder = node("sounds/haze", 2);
    let selection = selectArchiveAsset(
      new Map(),
      node("sounds/haze/a.vsnd_c", 1, false),
      true,
    );
    selection = selectArchiveAsset(
      selection,
      node("sounds/haze/b.vsnd_c", 1, false),
      true,
    );
    expect(assetSelectionState(selection, folder)).toBe(true);
    expect(selectArchiveAsset(selection, folder, false).size).toBe(0);
  });
  it("handles root selection and nested exceptions without expanding every file", () => {
    const root = node("", 100_000);
    let selection = selectArchiveAsset(new Map(), root, true);
    selection = selectArchiveAsset(selection, node("models", 30_000), false);
    selection = selectArchiveAsset(selection, node("models/haze", 50), true);
    expect(assetSelectionCount(selection)).toBe(70_050);
    expect(assetSelectionState(selection, root)).toBe("indeterminate");
    expect(archiveSelectionPayload(selection)).toEqual([
      { path: "", directory: true, selected: true },
      { path: "models", directory: true, selected: false },
      { path: "models/haze", directory: true, selected: true },
    ]);
  });
});
