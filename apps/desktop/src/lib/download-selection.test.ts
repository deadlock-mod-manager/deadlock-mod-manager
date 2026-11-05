import { describe, expect, test } from "bun:test";
import {
  componentSelectionModel,
  isSelectionValid,
  toggleSelection,
} from "@/lib/download-selection";
import type { NativeSourceInstallation } from "@/types/generated/NativeSourceInstallation";

const installation: NativeSourceInstallation = {
  mode: "components",
  components: [
    { id: "base", label: "Base", files: [] },
    { id: "cool", label: "Cool", files: [] },
    { id: "warm", label: "Warm", files: [] },
  ],
  requiredComponents: ["base"],
  choiceGroups: [
    {
      id: "variant",
      label: "Variant",
      minSelections: 1,
      maxSelections: 1,
      componentIds: ["cool", "warm"],
      defaultComponentIds: ["cool"],
    },
  ],
};

describe("component download selection", () => {
  test("starts with required components and the group defaults", () => {
    const model = componentSelectionModel(installation, []);
    expect(new Set(model.initialIds)).toEqual(new Set(["base", "cool"]));
    expect(isSelectionValid(model, new Set(model.initialIds))).toBe(true);
  });

  test("a single-choice group swaps its pick and locked components stay", () => {
    const model = componentSelectionModel(installation, []);
    const swapped = toggleSelection(
      model,
      new Set(model.initialIds),
      "warm",
      true,
    );
    expect(swapped).toEqual(new Set(["base", "warm"]));
    expect(toggleSelection(model, swapped, "base", false)).toEqual(swapped);
  });

  test("an empty required choice group is invalid", () => {
    const model = componentSelectionModel(installation, []);
    expect(isSelectionValid(model, new Set(["base"]))).toBe(false);
  });
});
