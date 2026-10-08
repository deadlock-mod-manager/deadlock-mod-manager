import { describe, expect, test } from "bun:test";
import type { EntryOverride } from "@/types/generated/EntryOverride";
import {
  actionForValue,
  applyDraftAction,
  countUnsavedChanges,
  diffOverrides,
  type EditorDraft,
  type ValueTarget,
} from "./draft";

const SSAO = ["ConVars", "r_ssao"];
const FOV = ["ConVars", "citadel_camera_hero_fov"];

const draft = (
  overrides: EntryOverride[] = [],
  includeEngineSections = false,
): EditorDraft => ({ overrides, includeEngineSections });

describe("applyDraftAction", () => {
  test("adds, replaces and removes one override per path", () => {
    const set = applyDraftAction(draft(), {
      kind: "set",
      path: SSAO,
      value: "0",
    });
    expect(set.overrides).toEqual([
      { path: SSAO, action: { kind: "set", value: "0" } },
    ]);

    const omitted = applyDraftAction(set, { kind: "omit", path: SSAO });
    expect(omitted.overrides).toEqual([
      { path: SSAO, action: { kind: "omit" } },
    ]);

    const reset = applyDraftAction(omitted, { kind: "reset", path: SSAO });
    expect(reset.overrides).toEqual([]);
  });

  test("matches paths case-insensitively and keeps the original casing", () => {
    const start = draft([{ path: SSAO, action: { kind: "omit" } }]);
    const next = applyDraftAction(start, {
      kind: "enable",
      path: ["convars", "R_SSAO"],
    });
    expect(next.overrides).toEqual([
      { path: SSAO, action: { kind: "enable" } },
    ]);
  });

  test("keeps the order of other overrides", () => {
    const start = draft([
      { path: SSAO, action: { kind: "omit" } },
      { path: FOV, action: { kind: "omit" } },
    ]);
    const next = applyDraftAction(start, {
      kind: "set",
      path: SSAO,
      value: "1",
    });
    expect(next.overrides.map((override) => override.path)).toEqual([
      SSAO,
      FOV,
    ]);
  });

  test("resetting a path without an override changes nothing", () => {
    const start = draft([{ path: FOV, action: { kind: "omit" } }]);
    expect(applyDraftAction(start, { kind: "reset", path: SSAO })).toBe(start);
  });

  test("toggles engine sections without touching overrides", () => {
    const start = draft([{ path: FOV, action: { kind: "omit" } }]);
    const next = applyDraftAction(start, {
      kind: "includeEngineSections",
      include: true,
    });
    expect(next.includeEngineSections).toBe(true);
    expect(next.overrides).toBe(start.overrides);
  });
});

describe("actionForValue", () => {
  const target: ValueTarget = {
    path: SSAO,
    configValue: "0",
    kind: "bool",
    offByDefault: false,
  };

  test("stores a value that differs from the config", () => {
    expect(actionForValue(target, "1")).toEqual({
      kind: "set",
      path: SSAO,
      value: "1",
    });
  });

  test("drops the override when the value goes back to the config's", () => {
    expect(actionForValue(target, "false")).toEqual({
      kind: "reset",
      path: SSAO,
    });
  });

  test("keeps an off-by-default tool enabled at the config's value", () => {
    expect(actionForValue({ ...target, offByDefault: true }, "0")).toEqual({
      kind: "enable",
      path: SSAO,
    });
  });

  test("always stores a value for a key the config doesn't set", () => {
    expect(actionForValue({ ...target, configValue: null }, "0")).toEqual({
      kind: "set",
      path: SSAO,
      value: "0",
    });
  });
});

describe("unsaved changes", () => {
  test("counts changed, added and removed paths, ignoring order", () => {
    const saved = draft([
      { path: SSAO, action: { kind: "set", value: "0" } },
      { path: FOV, action: { kind: "omit" } },
    ]);
    const [ssao, fov] = saved.overrides;
    expect(countUnsavedChanges(saved, draft([fov, ssao]))).toBe(0);

    const edited = draft([
      { path: SSAO, action: { kind: "set", value: "1" } },
      { path: ["ConVars", "r_rendersun"], action: { kind: "omit" } },
    ]);
    expect(diffOverrides(saved.overrides, edited.overrides)).toEqual([
      {
        path: SSAO,
        before: { kind: "set", value: "0" },
        after: { kind: "set", value: "1" },
      },
      {
        path: ["ConVars", "r_rendersun"],
        before: null,
        after: { kind: "omit" },
      },
      { path: FOV, before: { kind: "omit" }, after: null },
    ]);
    expect(countUnsavedChanges(saved, edited)).toBe(3);
  });

  test("counts the engine-section toggle as one change", () => {
    expect(countUnsavedChanges(draft(), draft([], true))).toBe(1);
  });
});
