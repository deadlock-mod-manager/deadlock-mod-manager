import { describe, expect, it, mock } from "bun:test";
import { readOnlyFilePath, runWithWritableRecovery } from "./file-permissions";

const readonly = {
  kind: "readOnlyFile",
  message: "File is read-only: C:\\game\\citadel\\gameinfo.gi",
  path: "C:\\game\\citadel\\gameinfo.gi",
};

describe("read-only recovery", () => {
  it("maps only typed read-only errors carrying a path", () => {
    expect(readOnlyFilePath(readonly)).toBe(readonly.path);
    for (const error of [
      null,
      "os error 5",
      { kind: "readOnlyFile", message: "missing path" },
      { ...readonly, kind: "io" },
    ]) {
      expect(readOnlyFilePath(error)).toBeNull();
    }
  });

  it("retries the original action exactly once after repair", async () => {
    let attempts = 0;
    let launches = 0;
    const action = async () => {
      attempts++;
      if (attempts === 1) throw readonly;
      return ++launches;
    };
    const repair = mock(async (path: string) => {
      expect(path).toBe(readonly.path);
      expect(launches).toBe(0);
      return true;
    });
    expect(await runWithWritableRecovery(action, repair)).toBe(1);
    expect(attempts).toBe(2);
    expect(launches).toBe(1);
    expect(repair).toHaveBeenCalledTimes(1);
  });

  it("does not retry after cancellation or an OS failure clearing the attribute", async () => {
    const action = mock(async () => {
      throw readonly;
    });
    await expect(
      runWithWritableRecovery(action, async () => false),
    ).rejects.toEqual(readonly);
    expect(action).toHaveBeenCalledTimes(1);
    action.mockClear();
    const denied = {
      kind: "makeWritableFailed",
      path: readonly.path,
      message: `Failed to make ${readonly.path} writable: Access is denied. (os error 5)`,
    };
    await expect(
      runWithWritableRecovery(action, async () => {
        throw denied;
      }),
    ).rejects.toEqual(denied);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("propagates a failed retry without opening another repair prompt", async () => {
    const action = mock(async () => {
      throw readonly;
    });
    const repair = mock(async () => true);
    await expect(runWithWritableRecovery(action, repair)).rejects.toEqual(
      readonly,
    );
    expect(action).toHaveBeenCalledTimes(2);
    expect(repair).toHaveBeenCalledTimes(1);
  });

  it("leaves successful actions and unrelated errors alone", async () => {
    const repair = mock(async () => true);
    expect(await runWithWritableRecovery(async () => 42, repair)).toBe(42);
    const missing = { kind: "missingEnabledModFiles", message: "missing VPK" };
    await expect(
      runWithWritableRecovery(async () => {
        throw missing;
      }, repair),
    ).rejects.toEqual(missing);
    expect(repair).not.toHaveBeenCalled();
  });
});
