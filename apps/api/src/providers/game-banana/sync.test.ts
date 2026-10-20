import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { createMockLogger } from "@deadlock-mods/logging";
import modIndex from "../../../../desktop/src-tauri/tests/fixtures/gamebanana/mod-index.json";
import modProfile from "../../../../desktop/src-tauri/tests/fixtures/gamebanana/mod-profile.json";

// Bun module mocks persist across files; isolate provider dependencies from other suites.
if (process.env.DMM_SYNC_TEST_CHILD !== "1") {
  it("verifies sync deferral with isolated service mocks", () => {
    const result = Bun.spawnSync([process.execPath, "test", import.meta.path], {
      env: { ...process.env, DMM_SYNC_TEST_CHILD: "1" },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(new TextDecoder().decode(result.stderr)).toContain("2 pass");
    expect(result.exitCode).toBe(0);
  });
} else {
  const markSynced = mock(async () => {});
  const upsert = mock(async () => {});
  const emit = mock((_outcome: "success" | "error", _error?: Error) => {});
  const set = mock((_key: string, _value: string | number) => {});

  mock.module("@deadlock-mods/database", () => ({
    db: {},
    ModRepository: class {
      markSynced = markSynced;
      upsertByRemoteId = upsert;
      async findIndexModifiedAtByRemoteIds() {
        return new Map<string, Date | null>();
      }
      async findLeastRecentlySynced() {
        return [];
      }
    },
    ModAuthorRepository: class {},
    ModDownloadRepository: class {},
  }));
  mock.module("../../lib/logger", () => ({
    logger: createMockLogger(),
    createWideEvent: () => ({ set, emit }),
    wideEventContext: { get: () => undefined },
  }));
  mock.module("../../services/geo", () => ({ resolveFileserverGeo: mock() }));
  mock.module("../../services/mod-cache", () => ({ modCache: {} }));
  mock.module("../../services/mod-sync-hooks", () => ({
    ModSyncHooksService: class {},
  }));

  const { GameBananaProvider } = await import("./index");

  afterEach(() => {
    mock.restore();
    markSynced.mockClear();
    upsert.mockClear();
    emit.mockClear();
    set.mockClear();
  });

  describe("GameBanana stale profile deferral", () => {
    it("keeps a stale profile pending across syncs without emitting an error or writing it", async () => {
      const fetch = spyOn(globalThis, "fetch").mockImplementation(
        Object.assign(
          async (input: string | Request | URL) => {
            const url = String(input);
            if (url.includes("/Mod/Index")) {
              return Response.json({
                ...modIndex,
                _aMetadata: { ...modIndex._aMetadata, _bIsComplete: true },
              });
            }
            if (url.includes("/Sound/Index")) {
              return Response.json({
                _aRecords: [],
                _aMetadata: { _bIsComplete: true },
              });
            }
            if (url.endsWith("/ProfilePage")) {
              return Response.json({
                ...modProfile,
                _tsDateModified: modProfile._tsDateModified - 60,
              });
            }
            throw new Error(`Unexpected request: ${url}`);
          },
          { preconnect: globalThis.fetch.preconnect },
        ),
      );
      const provider = new GameBananaProvider();
      await provider.synchronize();
      await provider.synchronize();

      expect(
        fetch.mock.calls.filter(([url]) =>
          String(url).endsWith("/ProfilePage"),
        ),
      ).toHaveLength(2);
      expect(markSynced).not.toHaveBeenCalled();
      expect(upsert).not.toHaveBeenCalled();
      expect(set).toHaveBeenCalledWith(
        "outcome_reason",
        "deferred_stale_profile",
      );
      expect(emit.mock.calls).toEqual([["success"], ["success"]]);
    });
    it("continues reporting actual profile request failures as errors", async () => {
      spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          Response.json({
            ...modIndex,
            _aMetadata: { ...modIndex._aMetadata, _bIsComplete: true },
          }),
        )
        .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
        .mockResolvedValueOnce(
          Response.json({ _aRecords: [], _aMetadata: { _bIsComplete: true } }),
        );

      await new GameBananaProvider().synchronize();

      expect(markSynced).not.toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith("error", expect.any(Error));
    });
  });
}
