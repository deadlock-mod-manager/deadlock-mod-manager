import { expect, test } from "bun:test";
import type { EntryOverride } from "@/types/generated/EntryOverride";
import { findOverride, sameApplyOptions, withOverride } from "./overrides";

const overrides: EntryOverride[] = [
  { path: ["ConVars", "r_ssao"], action: { kind: "set", value: "1" } },
  { path: ["ConVars", "fov"], action: { kind: "omit" } },
];

test("replaces the override for a path, matching case-insensitively", () => {
  const next = withOverride(overrides, ["convars", "R_SSAO"], { kind: "omit" });
  expect(next).toHaveLength(2);
  expect(findOverride(next, ["ConVars", "r_ssao"])?.action).toEqual({
    kind: "omit",
  });
});

test("compares tweaks regardless of order", () => {
  const reversed = [overrides[1], overrides[0]];
  expect(
    sameApplyOptions(
      { overrides, includeEngineSections: false },
      { overrides: reversed, includeEngineSections: false },
    ),
  ).toBe(true);
  expect(
    sameApplyOptions(
      { overrides, includeEngineSections: false },
      { overrides, includeEngineSections: true },
    ),
  ).toBe(false);
  expect(
    sameApplyOptions(
      { overrides, includeEngineSections: false },
      {
        overrides: withOverride(overrides, ["ConVars", "fov"], null),
        includeEngineSections: false,
      },
    ),
  ).toBe(false);
});

test("drops the override when the action is null", () => {
  expect(withOverride(overrides, ["ConVars", "fov"], null)).toEqual([
    overrides[0],
  ]);
});
