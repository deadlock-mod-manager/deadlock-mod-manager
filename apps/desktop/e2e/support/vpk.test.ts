import { describe, expect, it } from "bun:test";
import { buildSyntheticVpk, type VpkRecipeEntry } from "./vpk";

const recipe: readonly VpkRecipeEntry[] = [
  { path: "materials/heroes/test.vtex_c", contents: "texture" },
  { path: "scripts/test.txt", contents: "script" },
];

describe("synthetic VPK recipes", () => {
  it("writes a deterministic, inline VPK v2 archive", () => {
    const first = buildSyntheticVpk(recipe);
    const second = buildSyntheticVpk([...recipe].toReversed());
    expect(first).toEqual(second);
    expect(first.readUInt32LE(0)).toBe(0x55aa1234);
    expect(first.readUInt32LE(4)).toBe(2);
    expect(first.readUInt32LE(8)).toBeGreaterThan(0);
    expect(first.readUInt32LE(12)).toBe("texturescript".length);
    expect(first.includes(Buffer.from("materials/heroes\0"))).toBe(true);
  });

  it("rejects paths that could escape an archive recipe", () => {
    expect(() =>
      buildSyntheticVpk([{ path: "../outside.txt", contents: "bad" }]),
    ).toThrow("Unsafe VPK recipe path");
  });

  it("rejects duplicate normalized paths", () => {
    expect(() =>
      buildSyntheticVpk([
        { path: "scripts/test.txt", contents: "first" },
        { path: "SCRIPTS\\TEST.TXT", contents: "second" },
      ]),
    ).toThrow("Duplicate VPK recipe path");
  });
});
