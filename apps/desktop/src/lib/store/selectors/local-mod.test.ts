import { describe, expect, it } from "bun:test";
import { findLocalMod } from "./local-mod";

const mod = (remoteId: string, name: string) => ({ remoteId, name });

describe("findLocalMod", () => {
  it("returns the first mod with the remote id, like Array.find", () => {
    const first = mod("1", "first");
    const mods = [first, mod("2", "other"), mod("1", "duplicate")];
    expect(findLocalMod(mods, "1")).toBe(first);
    expect(findLocalMod(mods, "3")).toBeUndefined();
    expect(findLocalMod(mods, undefined)).toBeUndefined();
  });

  it("reflects a new array after the store replaces it", () => {
    const mods = [mod("1", "old")];
    expect(findLocalMod(mods, "1")?.name).toBe("old");
    const next = [mod("1", "new")];
    expect(findLocalMod(next, "1")?.name).toBe("new");
  });
});
