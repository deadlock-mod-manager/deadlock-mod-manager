import { describe, expect, it, mock } from "bun:test";

mock.module("@/lib/logger", () => ({
  default: {
    withMetadata: () => ({
      withError: () => ({
        warn: () => {},
        error: () => {},
        info: () => {},
        debug: () => {},
      }),
      warn: () => {},
      error: () => {},
      info: () => {},
      debug: () => {},
    }),
    withError: () => ({
      withMetadata: () => ({
        warn: () => {},
        error: () => {},
        info: () => {},
        debug: () => {},
      }),
      warn: () => {},
      error: () => {},
      info: () => {},
      debug: () => {},
    }),
  },
}));

const { LATEST_VERSION, MIGRATION_STEPS, safeMigrate } =
  await import("./migrate");

describe("safeMigrate", () => {
  it("returns persistedState as-is when not a plain object", () => {
    expect(safeMigrate(null, 0)).toBe(null);
    expect(safeMigrate("garbage", 0)).toBe("garbage");
    expect(safeMigrate([1, 2, 3], 0)).toEqual([1, 2, 3]);
  });

  it("runs every step on a fresh empty state from version 0", () => {
    const state: Record<string, unknown> = {};
    const result = safeMigrate(state, 0) as Record<string, unknown>;
    expect(result.linuxGpuOptimization).toBe("auto");
    expect(result.activeCrosshairHistory).toEqual([]);
    expect(result.activeCrosshair).toBe(null);
    expect(result.crosshairFilters).toMatchObject({
      filterMode: "include",
      currentSort: "last updated",
    });
    expect(result.backupEnabled).toBe(true);
    expect(result.maxBackupCount).toBe(5);
    expect(result.fileserverPreference).toBe("default");
    expect(result.fileserverLatencyMs).toEqual({});
    expect(result.proxyConfig).toMatchObject({
      enabled: false,
      port: 8080,
      protocol: "http",
    });
    expect(result.showOccultGeometry).toBe(true);
    expect(result.animateOccultGeometry).toBe(true);
    expect(result.heroParserIntervalSeconds).toBe(30);
  });

  it("skips steps whose target is <= fromVersion", () => {
    const state = {
      proxyConfig: { enabled: true, host: "myhost", port: 1234 },
    };
    const result = safeMigrate(state, 18) as Record<string, unknown>;
    // v15->v16 step should NOT have run, leaving the user's proxy intact.
    expect(result.proxyConfig).toEqual({
      enabled: true,
      host: "myhost",
      port: 1234,
    });
    // v18->v19 should have added the new field.
    expect(result.heroParserIntervalSeconds).toBe(30);
  });

  it("preserves user values when re-running idempotent steps after version bump", () => {
    // Real-world scenario: user is at v15 with populated state. The persist
    // version bump 18->19 means steps 16-19 run on this state.
    const state = {
      proxyConfig: {
        enabled: true,
        host: "10.0.0.1",
        port: 9999,
        protocol: "socks5",
        authEnabled: true,
        username: "u",
        password: "p",
        noProxy: "localhost",
      },
      showOccultGeometry: false,
      animateOccultGeometry: false,
      backupEnabled: false,
      maxBackupCount: 99,
      fileserverPreference: "auto",
      fileserverLatencyMs: { server1: 42 },
      linuxGpuOptimization: "off",
      heroParserIntervalSeconds: 5,
    };
    const result = safeMigrate(state, 15) as Record<string, unknown>;
    expect(result.proxyConfig).toEqual(state.proxyConfig);
    expect(result.showOccultGeometry).toBe(false);
    expect(result.animateOccultGeometry).toBe(false);
    expect(result.backupEnabled).toBe(false);
    expect(result.maxBackupCount).toBe(99);
    expect(result.fileserverPreference).toBe("auto");
    expect(result.fileserverLatencyMs).toEqual({ server1: 42 });
    expect(result.linuxGpuOptimization).toBe("off");
    expect(result.heroParserIntervalSeconds).toBe(5);
  });

  it("snapshot+revert: a malformed value that breaks one step doesn't poison later steps", () => {
    // Force the v9->v10 step to encounter a non-plain `localMods` entry. We
    // can do that by giving `localMods` a wrong shape that the guarded code
    // skips. To actually exercise the catch path, we monkey-patch one step's
    // apply() to throw and verify state is reverted.
    const stepIndex = MIGRATION_STEPS.findIndex(
      (s) => s.label === "add-backup-settings",
    );
    const originalApply = MIGRATION_STEPS[stepIndex].apply;
    let didThrow = false;
    (MIGRATION_STEPS as unknown as Array<{ apply: typeof originalApply }>)[
      stepIndex
    ].apply = (s) => {
      s.partialMutation = "should-be-reverted";
      didThrow = true;
      throw new Error("simulated step failure");
    };

    try {
      const state: Record<string, unknown> = {
        gamePath: "/games/deadlock",
      };
      const result = safeMigrate(state, 11) as Record<string, unknown>;
      // The throwing step's partial mutation should have been reverted.
      expect(result.partialMutation).toBeUndefined();
      // gamePath survives.
      expect(result.gamePath).toBe("/games/deadlock");
      // Subsequent steps still ran.
      expect(result.fileserverPreference).toBe("default");
      expect(result.heroParserIntervalSeconds).toBe(30);
      expect(didThrow).toBe(true);
    } finally {
      (MIGRATION_STEPS as unknown as Array<{ apply: typeof originalApply }>)[
        stepIndex
      ].apply = originalApply;
    }
  });

  it("LATEST_VERSION matches the highest step target", () => {
    const max = Math.max(...MIGRATION_STEPS.map((s) => s.to));
    expect(LATEST_VERSION).toBe(max);
    expect(LATEST_VERSION).toBe(19);
  });

  describe("specific step idempotency", () => {
    it("v3 (foldername): preserves existing folderName even if non-default profile", () => {
      const state: Record<string, unknown> = {
        profiles: {
          myProfile: {
            id: "myProfile",
            name: "Custom Name",
            folderName: "preexisting_folder",
          },
        },
      };
      const result = safeMigrate(state, 2) as Record<string, unknown>;
      const profiles = result.profiles as Record<
        string,
        { folderName: string }
      >;
      expect(profiles.myProfile.folderName).toBe("preexisting_folder");
    });

    it("v3 (foldername): generates folderName when missing on non-default profile", () => {
      const state: Record<string, unknown> = {
        profiles: {
          p1: { id: "p1", name: "My Profile" },
        },
      };
      const result = safeMigrate(state, 2) as Record<string, unknown>;
      const profiles = result.profiles as Record<
        string,
        { folderName: string }
      >;
      expect(profiles.p1.folderName).toBe("p1_my-profile");
    });

    it("v9 (filter rename): does not overwrite an already-renamed hideNSFW default", () => {
      const state: Record<string, unknown> = {
        modsFilters: { showNSFW: true, hideOutdated: false },
      };
      const result = safeMigrate(state, 8) as Record<string, unknown>;
      const filters = result.modsFilters as Record<string, unknown>;
      // showNSFW renamed to hideNSFW=false (default), since user hadn't set hideNSFW.
      expect(filters.hideNSFW).toBe(false);
      // hideOutdated user-value preserved.
      expect(filters.hideOutdated).toBe(false);
      expect(filters.showNSFW).toBeUndefined();
    });

    it("v15 (audio/map quick filter): converts hideAudio=true to audioQuickFilter=exclude exactly once", () => {
      const state: Record<string, unknown> = {
        modsFilters: { hideAudio: true, hideMap: true },
      };
      const result = safeMigrate(state, 14) as Record<string, unknown>;
      const filters = result.modsFilters as Record<string, unknown>;
      expect(filters.audioQuickFilter).toBe("exclude");
      expect(filters.mapQuickFilter).toBe("exclude");
      expect(filters.hideAudio).toBeUndefined();
      expect(filters.hideMap).toBeUndefined();
    });

    it("v15: preserves an already-set audioQuickFilter when re-running on hidden migration", () => {
      const state: Record<string, unknown> = {
        modsFilters: { audioQuickFilter: "only", mapQuickFilter: "off" },
      };
      const result = safeMigrate(state, 14) as Record<string, unknown>;
      const filters = result.modsFilters as Record<string, unknown>;
      expect(filters.audioQuickFilter).toBe("only");
      expect(filters.mapQuickFilter).toBe("off");
    });
  });
});
