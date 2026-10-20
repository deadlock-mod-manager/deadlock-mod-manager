import { describe, expect, it } from "bun:test";
import type { ModGroup } from "@/types/profiles";
import { modGroupDropId, resolveModGroupDrop } from "./library-groups";

const groups: ModGroup[] = [
  { id: "silver", name: "Silver", modIds: [], collapsed: true },
  { id: "library-ungrouped", name: "Maps", modIds: [], collapsed: false },
];

describe("library group drop targets", () => {
  it("accepts collapsed groups and Ungrouped as distinct targets", () => {
    expect(resolveModGroupDrop(modGroupDropId("silver"), groups)).toBe(
      "silver",
    );
    expect(resolveModGroupDrop(modGroupDropId(null), groups)).toBeNull();
    expect(
      resolveModGroupDrop(modGroupDropId("library-ungrouped"), groups),
    ).toBe("library-ungrouped");
  });

  it("rejects a stale target after deletion or a profile switch", () => {
    expect(resolveModGroupDrop(modGroupDropId("silver"), [])).toBeUndefined();
    expect(resolveModGroupDrop("silver", groups)).toBeUndefined();
    expect(resolveModGroupDrop(1, groups)).toBeUndefined();
  });
});
