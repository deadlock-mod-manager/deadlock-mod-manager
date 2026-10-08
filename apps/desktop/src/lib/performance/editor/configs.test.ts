import { describe, expect, test } from "bun:test";
import type { UserPerfConfig } from "@/lib/store/slices/performance";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";
import {
  editorBaseRequest,
  editorConfigOptions,
  isAppliedAs,
  savedDraftFor,
  withDraft,
} from "./configs";

const PRESETS = [
  { id: "optilock", name: "OptimizationLock" },
  { id: "dmm-clean", name: "DMM Clean" },
];

const userConfig = (
  id: string,
  createdAt: string,
  origin: UserPerfConfig["origin"] = { kind: "currentGameinfo" },
): UserPerfConfig => ({
  id,
  name: `Config ${id}`,
  createdAt,
  origin,
  entries: [{ path: ["ConVars", "r_ssao"], value: "0" }],
  videoSettings: [],
  baseBuild: null,
});

const USER_CONFIGS = {
  "user:old": userConfig("user:old", "2026-01-01T00:00:00Z"),
  "user:new": userConfig("user:new", "2026-09-01T00:00:00Z", {
    kind: "fork",
    fromConfigId: "preset:optilock",
  }),
} satisfies Record<string, UserPerfConfig>;

const desired = (
  overrides: Partial<PerfApplyRequest> = {},
): PerfApplyRequest => ({
  configId: "preset:optilock",
  name: "OptimizationLock",
  source: { kind: "preset", id: "optilock" },
  overrides: [
    { path: ["ConVars", "r_ssao"], action: { kind: "set", value: "1" } },
  ],
  includeEngineSections: true,
  ...overrides,
});

describe("editorConfigOptions", () => {
  test("lists presets, then the user's configs newest first", () => {
    expect(
      editorConfigOptions(PRESETS, USER_CONFIGS, null).map(
        (option) => option.configId,
      ),
    ).toEqual(["preset:optilock", "preset:dmm-clean", "user:new", "user:old"]);
  });

  test("keeps the applied config even when it's gone from the catalog", () => {
    const gone = desired({ configId: "preset:retired", name: "Retired" });
    expect(editorConfigOptions([], {}, gone)).toEqual([
      { configId: "preset:retired", name: "Retired", group: "preset" },
    ]);
  });
});

describe("editorBaseRequest", () => {
  test("builds a preset request without tweaks", () => {
    expect(editorBaseRequest("preset:dmm-clean", PRESETS, {}, null)).toEqual({
      configId: "preset:dmm-clean",
      name: "DMM Clean",
      source: { kind: "preset", id: "dmm-clean" },
      overrides: [],
      includeEngineSections: false,
    });
  });

  test("inlines a user config's entries", () => {
    const request = editorBaseRequest("user:old", PRESETS, USER_CONFIGS, null);
    expect(request?.source).toEqual({
      kind: "inline",
      definition: {
        id: "user:old",
        name: "Config user:old",
        entries: [{ path: ["ConVars", "r_ssao"], value: "0" }],
      },
    });
  });

  test("falls back to the applied request, minus its tweaks", () => {
    const request = editorBaseRequest("preset:optilock", [], {}, desired());
    expect(request?.source).toEqual({ kind: "preset", id: "optilock" });
    expect(request?.overrides).toEqual([]);
    expect(request?.includeEngineSections).toBe(false);
  });

  test("returns null for an unknown config", () => {
    expect(editorBaseRequest("user:missing", PRESETS, {}, null)).toBeNull();
  });

  test("withDraft carries the draft into the request", () => {
    const base = editorBaseRequest("preset:optilock", PRESETS, {}, null);
    if (!base) throw new Error("expected a preset request");
    const draft = {
      overrides: [{ path: ["ConVars", "r_ssao"], action: { kind: "omit" } }],
      includeEngineSections: true,
    } satisfies Parameters<typeof withDraft>[1];
    expect(withDraft(base, draft)).toMatchObject(draft);
  });
});

describe("saved tweaks", () => {
  test("come from the store, else from what was applied", () => {
    expect(savedDraftFor("preset:optilock", {}, {}, desired())).toEqual({
      overrides: desired().overrides,
      includeEngineSections: true,
    });
    expect(
      savedDraftFor(
        "preset:optilock",
        { "preset:optilock": [] },
        { "preset:optilock": false },
        desired(),
      ),
    ).toEqual({ overrides: [], includeEngineSections: false });
    expect(savedDraftFor("user:old", {}, {}, desired())).toEqual({
      overrides: [],
      includeEngineSections: false,
    });
  });

  test("isAppliedAs compares config, tweaks and the engine toggle", () => {
    const saved = savedDraftFor("preset:optilock", {}, {}, desired());
    expect(isAppliedAs("preset:optilock", saved, desired())).toBe(true);
    expect(isAppliedAs("preset:dmm-clean", saved, desired())).toBe(false);
    expect(
      isAppliedAs(
        "preset:optilock",
        { ...saved, includeEngineSections: false },
        desired(),
      ),
    ).toBe(false);
    expect(isAppliedAs("preset:optilock", saved, null)).toBe(false);
  });
});
