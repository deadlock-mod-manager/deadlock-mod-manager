import { describe, expect, it } from "bun:test";
import { swapHeroSkin } from "./skin-swap";

type TestMod = { remoteId: string };
const mod = (id: string): TestMod => ({ remoteId: id });

const recordingDeps = (
  uninstallResults: Record<string, boolean> = {},
  installResults: Record<string, boolean> = {},
) => {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      uninstall: async (m: TestMod) => {
        calls.push(`uninstall:${m.remoteId}`);
        return uninstallResults[m.remoteId] ?? true;
      },
      install: async (m: TestMod) => {
        calls.push(`install:${m.remoteId}`);
        return installResults[m.remoteId] ?? true;
      },
    },
  };
};

describe("swapHeroSkin", () => {
  it("uninstalls the active skin before installing the target", async () => {
    const { calls, deps } = recordingDeps();
    const result = await swapHeroSkin([mod("old")], mod("new"), deps);
    expect(result).toBe("swapped");
    expect(calls).toEqual(["uninstall:old", "install:new"]);
  });

  it("aborts without installing when an uninstall fails", async () => {
    const { calls, deps } = recordingDeps({ old: false });
    const result = await swapHeroSkin([mod("old")], mod("new"), deps);
    expect(result).toBe("aborted");
    expect(calls).toEqual(["uninstall:old"]);
  });

  it("resets to default by uninstalling every active skin", async () => {
    const { calls, deps } = recordingDeps();
    const result = await swapHeroSkin([mod("a"), mod("b")], null, deps);
    expect(result).toBe("reset");
    expect(calls).toEqual(["uninstall:a", "uninstall:b"]);
  });

  it("does nothing when the target is already the only active skin", async () => {
    const { calls, deps } = recordingDeps();
    const result = await swapHeroSkin([mod("a")], mod("a"), deps);
    expect(result).toBe("noop");
    expect(calls).toEqual([]);
  });

  it("does nothing when resetting to default with no active skins", async () => {
    const { calls, deps } = recordingDeps();
    const result = await swapHeroSkin([], null, deps);
    expect(result).toBe("noop");
    expect(calls).toEqual([]);
  });

  it("keeps the target and removes the rest when resolving a conflict", async () => {
    const { calls, deps } = recordingDeps();
    const result = await swapHeroSkin([mod("a"), mod("b")], mod("a"), deps);
    expect(result).toBe("swapped");
    expect(calls).toEqual(["uninstall:b"]);
  });

  it("installs the target when nothing is active", async () => {
    const { calls, deps } = recordingDeps();
    const result = await swapHeroSkin([], mod("new"), deps);
    expect(result).toBe("swapped");
    expect(calls).toEqual(["install:new"]);
  });

  it("aborts when the install fails", async () => {
    const { calls, deps } = recordingDeps({}, { new: false });
    const result = await swapHeroSkin([mod("old")], mod("new"), deps);
    expect(result).toBe("aborted");
    expect(calls).toEqual(["uninstall:old", "install:new"]);
  });
});
