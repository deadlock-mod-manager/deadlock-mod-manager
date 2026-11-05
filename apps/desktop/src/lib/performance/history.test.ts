import { describe, expect, test } from "bun:test";
import type {
  PerfHistoryEntry,
  UserPerfConfig,
} from "@/lib/store/slices/performance";
import type { EntryOverride } from "@/types/generated/EntryOverride";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";
import type { VideoChange } from "@/types/generated/VideoChange";
import {
  compactHistoryRequest,
  historyApplyRequest,
  undoTarget,
  unloggedVideoChanges,
} from "./history";

const TWEAKS: EntryOverride[] = [
  { path: ["ConVars", "r_ssao"], action: { kind: "set", value: "1" } },
];

const presetRequest = (configId: string): PerfApplyRequest => ({
  configId,
  name: configId,
  source: { kind: "preset", id: configId },
  overrides: [],
  includeEngineSections: false,
  writeVideo: true,
  videoVariant: null,
});

const userConfig: UserPerfConfig = {
  id: "user:mine",
  name: "Mine",
  createdAt: "2026-10-01T00:00:00.000Z",
  origin: { kind: "currentGameinfo" },
  entries: [
    { path: ["ConVars", "r_ssao"], value: "0" },
    { path: ["ConVars", "r_dof"], value: "0" },
  ],
  videoSettings: [],
  baseBuild: null,
};

const userRequest: PerfApplyRequest = {
  configId: userConfig.id,
  name: userConfig.name,
  source: {
    kind: "inline",
    definition: {
      id: userConfig.id,
      name: userConfig.name,
      entries: userConfig.entries,
      videoSettings: [],
    },
  },
  overrides: TWEAKS,
  includeEngineSections: true,
  writeVideo: false,
  videoVariant: null,
};

const applied = (request: PerfApplyRequest): PerfHistoryEntry => ({
  id: request.configId,
  at: "2026-10-08T00:00:00.000Z",
  action: "applied",
  configId: request.configId,
  name: request.name,
  request: compactHistoryRequest(request),
  appliedCount: 10,
  videoCount: null,
});

const removed: PerfHistoryEntry = {
  id: "removed",
  at: "2026-10-08T00:00:00.000Z",
  action: "removed",
  configId: null,
  name: null,
  request: null,
  appliedCount: null,
  videoCount: null,
};

const SHADOWS: VideoChange = {
  key: "r_citadel_shadow_quality",
  written: "0",
  current: "2",
  kept: false,
};

const videoChanged = (changes: VideoChange[]): PerfHistoryEntry => ({
  id: "video",
  at: "2026-10-08T00:00:00.000Z",
  action: "videoChanged",
  changes: changes.map(({ key, written, current }) => ({
    key,
    written,
    current,
    label: null,
  })),
});

const USER_CONFIGS = { [userConfig.id]: userConfig };

describe("compactHistoryRequest", () => {
  test("leaves out a user config's entries", () => {
    expect(compactHistoryRequest(userRequest)).toEqual({
      configId: "user:mine",
      name: "Mine",
      source: { kind: "inline" },
      overrides: TWEAKS,
      includeEngineSections: true,
      writeVideo: false,
      videoVariant: null,
    });
  });

  test("keeps a preset request as it is", () => {
    expect(compactHistoryRequest(presetRequest("preset:a"))).toEqual(
      presetRequest("preset:a"),
    );
  });
});

describe("historyApplyRequest", () => {
  test("reads a user config's entries back from the config", () => {
    expect(
      historyApplyRequest(compactHistoryRequest(userRequest), USER_CONFIGS),
    ).toEqual(userRequest);
  });

  test("can't re-apply a deleted user config", () => {
    expect(
      historyApplyRequest(compactHistoryRequest(userRequest), {}),
    ).toBeNull();
  });

  test("re-applies a preset without looking up user configs", () => {
    expect(
      historyApplyRequest(compactHistoryRequest(presetRequest("preset:a")), {}),
    ).toEqual(presetRequest("preset:a"));
  });
});

describe("undoTarget", () => {
  test("goes back to the config applied before", () => {
    expect(
      undoTarget(
        [applied(presetRequest("b")), applied(presetRequest("a"))],
        "b",
        {},
      ),
    ).toEqual({ kind: "apply", request: presetRequest("a") });
  });

  test("goes back to a user config with its entries", () => {
    expect(
      undoTarget(
        [applied(presetRequest("b")), applied(userRequest)],
        "b",
        USER_CONFIGS,
      ),
    ).toEqual({ kind: "apply", request: userRequest });
  });

  test("offers nothing when the config before was deleted", () => {
    expect(
      undoTarget([applied(presetRequest("b")), applied(userRequest)], "b", {}),
    ).toBeNull();
  });

  test("turns the config off when it was the first one", () => {
    expect(undoTarget([applied(presetRequest("a"))], "a", {})).toEqual({
      kind: "remove",
    });
    expect(undoTarget([applied(presetRequest("a")), removed], "a", {})).toEqual(
      { kind: "remove" },
    );
  });

  test("re-applies what was turned off", () => {
    expect(
      undoTarget([removed, applied(presetRequest("a"))], null, {}),
    ).toEqual({ kind: "apply", request: presetRequest("a") });
  });

  test("offers nothing when History doesn't match the current config", () => {
    expect(undoTarget([applied(presetRequest("a"))], "b", {})).toBeNull();
    expect(undoTarget([], null, {})).toBeNull();
    expect(undoTarget([removed], null, {})).toBeNull();
  });
});

describe("video.txt entries", () => {
  test("undo skips them and goes back to the config before", () => {
    expect(
      undoTarget(
        [
          videoChanged([SHADOWS]),
          applied(presetRequest("b")),
          applied(presetRequest("a")),
        ],
        "b",
        {},
      ),
    ).toEqual({ kind: "apply", request: presetRequest("a") });
  });

  test("a change is logged once until the config is applied again", () => {
    expect(unloggedVideoChanges([videoChanged([SHADOWS])], [SHADOWS])).toEqual(
      [],
    );
    const again = { ...SHADOWS, current: "1" };
    expect(unloggedVideoChanges([videoChanged([SHADOWS])], [again])).toEqual([
      again,
    ]);
    expect(
      unloggedVideoChanges(
        [applied(presetRequest("a")), videoChanged([SHADOWS])],
        [SHADOWS],
      ),
    ).toEqual([SHADOWS]);
  });

  test("keeping one setting doesn't log the others again", () => {
    const fog: VideoChange = { ...SHADOWS, key: "r_citadel_fog_quality" };
    const kept: PerfHistoryEntry = {
      id: "kept",
      at: "2026-10-08T00:00:00.000Z",
      action: "videoKept",
      keys: [fog.key],
    };
    expect(
      unloggedVideoChanges([kept, videoChanged([SHADOWS, fog])], [SHADOWS]),
    ).toEqual([]);
    expect(
      unloggedVideoChanges([kept, videoChanged([SHADOWS, fog])], [fog]),
    ).toEqual([fog]);
  });
});
