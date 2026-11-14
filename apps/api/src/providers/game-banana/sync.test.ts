import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { RuntimeError } from "@deadlock-mods/common";
import { ModRepository } from "@deadlock-mods/database";
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
    expect(new TextDecoder().decode(result.stderr)).toContain("5 pass");
    expect(result.exitCode).toBe(0);
  });
} else {
  const markSynced = mock(async () => {});
  const upsert = mock(async () => {
    throw new Error("Unexpected mod write");
  });
  const emit = mock((_outcome: "success" | "error", _error?: Error) => {});
  const set = mock((_key: string, _value: string | number) => {});

  beforeEach(() => {
    spyOn(ModRepository.prototype, "markSynced").mockImplementation(markSynced);
    spyOn(ModRepository.prototype, "upsertByRemoteId").mockImplementation(
      upsert,
    );
    spyOn(
      ModRepository.prototype,
      "findIndexModifiedAtByRemoteIds",
    ).mockResolvedValue(new Map<string, Date | null>());
    spyOn(ModRepository.prototype, "findLeastRecentlySynced").mockResolvedValue(
      [],
    );
  });
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
    it("does not turn lock loss during hydration into a failed item result", async () => {
      const provider = new GameBananaProvider();
      const controller = new AbortController();
      const failure = new RuntimeError("Lock lost");
      spyOn(provider, "createModPayload").mockImplementation(async () => {
        controller.abort(failure);
        return "not_found";
      });

      await expect(
        provider.createMod(modIndex._aRecords[0], "all", {
          signal: controller.signal,
        }),
      ).rejects.toBe(failure);
      expect(upsert).not.toHaveBeenCalled();
    });

    it("stops before acknowledging an item or processing another item after lock loss", async () => {
      const provider = new GameBananaProvider();
      const controller = new AbortController();
      const failure = new RuntimeError("Lock lost");
      spyOn(globalThis, "fetch").mockResolvedValue(
        Response.json({
          ...modIndex,
          _aRecords: [...modIndex._aRecords, ...modIndex._aRecords],
          _aMetadata: { ...modIndex._aMetadata, _bIsComplete: true },
        }),
      );
      const create = spyOn(provider, "createMod").mockImplementation(
        async () => {
          controller.abort(failure);
          return {
            mod: undefined,
            filesChanged: false,
            contentChanged: false,
            skipped: "not_found",
          };
        },
      );

      await expect(provider.synchronize(controller.signal)).rejects.toBe(
        failure,
      );
      expect(markSynced).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledTimes(1);
    });

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
    it("reports a 200 error envelope as a provider error instead of crashing", async () => {
      spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          Response.json({
            ...modIndex,
            _aMetadata: { ...modIndex._aMetadata, _bIsComplete: true },
          }),
        )
        .mockResolvedValueOnce(
          Response.json({ _sErrorCode: "ERR_TEST", _sErrorMessage: "Nope" }),
        )
        .mockResolvedValueOnce(
          Response.json({ _aRecords: [], _aMetadata: { _bIsComplete: true } }),
        );

      await new GameBananaProvider().synchronize();

      expect(markSynced).not.toHaveBeenCalled();
      const [, error] =
        emit.mock.calls.find(([outcome]) => outcome === "error") ?? [];
      expect(error?.message).toContain("ERR_TEST (Nope)");
    });
  });
}
