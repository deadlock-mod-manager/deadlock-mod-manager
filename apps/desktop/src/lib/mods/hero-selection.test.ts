import { describe, expect, it } from "bun:test";
import { applyHeroSelection, nextHeroSelection } from "./hero-selection";

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

describe("nextHeroSelection", () => {
  it("replaces everything with the target in exclusive mode", () => {
    expect(
      nextHeroSelection([mod("a"), mod("b")], mod("c"), "exclusive"),
    ).toEqual([mod("c")]);
  });

  it("adds to what is already on in toggle mode", () => {
    expect(nextHeroSelection([mod("a")], mod("b"), "toggle")).toEqual([
      mod("a"),
      mod("b"),
    ]);
  });

  it("turns the target back off when it is already on in toggle mode", () => {
    expect(nextHeroSelection([mod("a"), mod("b")], mod("b"), "toggle")).toEqual(
      [mod("a")],
    );
  });

  it("clears everything for the default in either mode", () => {
    expect(nextHeroSelection([mod("a")], null, "exclusive")).toEqual([]);
    expect(nextHeroSelection([mod("a")], null, "toggle")).toEqual([]);
  });
});

describe("applyHeroSelection", () => {
  it("uninstalls the active skin before installing the target", async () => {
    const { calls, deps } = recordingDeps();
    const result = await applyHeroSelection([mod("old")], [mod("new")], deps);
    expect(result).toBe("applied");
    expect(calls).toEqual(["uninstall:old", "install:new"]);
  });

  it("aborts without installing when an uninstall fails", async () => {
    const { calls, deps } = recordingDeps({ old: false });
    const result = await applyHeroSelection([mod("old")], [mod("new")], deps);
    expect(result).toBe("aborted");
    expect(calls).toEqual(["uninstall:old"]);
  });

  it("resets to default by uninstalling everything active", async () => {
    const { calls, deps } = recordingDeps();
    const result = await applyHeroSelection([mod("a"), mod("b")], [], deps);
    expect(result).toBe("applied");
    expect(calls).toEqual(["uninstall:a", "uninstall:b"]);
  });

  it("does nothing when the wanted set is already installed", async () => {
    const { calls, deps } = recordingDeps();
    const result = await applyHeroSelection([mod("a")], [mod("a")], deps);
    expect(result).toBe("noop");
    expect(calls).toEqual([]);
  });

  it("does nothing when resetting to default with nothing active", async () => {
    const { calls, deps } = recordingDeps();
    const result = await applyHeroSelection([], [], deps);
    expect(result).toBe("noop");
    expect(calls).toEqual([]);
  });

  it("keeps the target and removes the rest when resolving a conflict", async () => {
    const { calls, deps } = recordingDeps();
    const result = await applyHeroSelection(
      [mod("a"), mod("b")],
      [mod("a")],
      deps,
    );
    expect(result).toBe("applied");
    expect(calls).toEqual(["uninstall:b"]);
  });

  it("leaves the rest alone when stacking another entry on top", async () => {
    const { calls, deps } = recordingDeps();
    const result = await applyHeroSelection(
      [mod("a")],
      [mod("a"), mod("b")],
      deps,
    );
    expect(result).toBe("applied");
    expect(calls).toEqual(["install:b"]);
  });

  it("aborts when the install fails", async () => {
    const { calls, deps } = recordingDeps({}, { new: false });
    const result = await applyHeroSelection([mod("old")], [mod("new")], deps);
    expect(result).toBe("aborted");
    expect(calls).toEqual(["uninstall:old", "install:new"]);
  });
});
