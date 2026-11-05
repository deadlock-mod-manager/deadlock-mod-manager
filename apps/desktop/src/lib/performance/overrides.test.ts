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

const VIDEO = { writeVideo: true, videoVariant: null };

test("compares tweaks regardless of order", () => {
  const reversed = [overrides[1], overrides[0]];
  expect(
    sameApplyOptions(
      { overrides, includeEngineSections: false, ...VIDEO },
      { overrides: reversed, includeEngineSections: false, ...VIDEO },
    ),
  ).toBe(true);
  expect(
    sameApplyOptions(
      { overrides, includeEngineSections: false, ...VIDEO },
      { overrides, includeEngineSections: true, ...VIDEO },
    ),
  ).toBe(false);
  expect(
    sameApplyOptions(
      { overrides, includeEngineSections: false, ...VIDEO },
      {
        overrides: withOverride(overrides, ["ConVars", "fov"], null),
        includeEngineSections: false,
        ...VIDEO,
      },
    ),
  ).toBe(false);
});

test("drops the override when the action is null", () => {
  expect(withOverride(overrides, ["ConVars", "fov"], null)).toEqual([
    overrides[0],
  ]);
});
