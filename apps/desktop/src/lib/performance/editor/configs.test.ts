import { describe, expect, test } from "bun:test";
import type { UserPerfConfig } from "@/lib/store/slices/performance";
import type { DesiredOverlay } from "@/types/generated/DesiredOverlay";
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
      includeEngineSections: true,
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
    expect(request?.includeEngineSections).toBe(true);
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

/** What was applied, and how many engine-section edits it left out. */
const applied = (
  request: PerfApplyRequest,
  engineSection: number,
): DesiredOverlay => ({
  request,
  rev: "0123456789ab",
  appliedAt: "2026-10-21T12:00:00+00:00",
  counts: {
    applies: 0,
    unchanged: 0,
    blocked: 0,
    removed: 0,
    notConvar: 0,
    engineSection,
    excluded: 0,
    denied: 0,
    omitted: 0,
    unsupported: 0,
    overridden: 0,
  },
});

describe("saved tweaks", () => {
  test("come from the store; overrides fall back to what was applied", () => {
    const leftOut = applied(desired({ includeEngineSections: false }), 3);
    expect(savedDraftFor("preset:optilock", {}, {}, leftOut)).toEqual({
      overrides: desired().overrides,
      includeEngineSections: true,
    });
    expect(
      savedDraftFor(
        "preset:optilock",
        { "preset:optilock": [] },
        { "preset:optilock": false },
        leftOut,
      ),
    ).toEqual({ overrides: [], includeEngineSections: false });
    expect(savedDraftFor("user:old", {}, {}, leftOut)).toEqual({
      overrides: [],
      includeEngineSections: true,
    });
  });

  test("keep the applied engine choice when it left nothing out", () => {
    const nothingLeftOut = applied(
      desired({ includeEngineSections: false }),
      0,
    );
    const saved = savedDraftFor("preset:optilock", {}, {}, nothingLeftOut);
    expect(saved.includeEngineSections).toBe(false);
    expect(isAppliedAs("preset:optilock", saved, nothingLeftOut.request)).toBe(
      true,
    );
  });

  test("isAppliedAs compares config, tweaks and the engine toggle", () => {
    const saved = savedDraftFor(
      "preset:optilock",
      {},
      {},
      applied(desired(), 0),
    );
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
