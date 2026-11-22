import { describe, expect, it } from "bun:test";
import { buildPersistMerge, deepMergeOne, isPlainObject } from "./merge";

describe("isPlainObject", () => {
  it("returns true for plain objects", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
  });

  it("returns false for arrays, null, primitives, and class instances", () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject("")).toBe(false);
    expect(isPlainObject(0)).toBe(false);
    expect(isPlainObject(false)).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
  });
});

describe("deepMergeOne", () => {
  it("returns incoming when base is not a plain object", () => {
    expect(deepMergeOne(null, { a: 1 })).toEqual({ a: 1 });
    expect(deepMergeOne([], { a: 1 })).toEqual({ a: 1 });
    expect(deepMergeOne("hello", { a: 1 })).toEqual({ a: 1 });
  });

  it("returns base when incoming is undefined", () => {
    const base = { a: 1 };
    expect(deepMergeOne(base, undefined)).toBe(base);
  });

  it("returns incoming when incoming is not a plain object (arrays, primitives win wholesale)", () => {
    expect(deepMergeOne({ a: 1 }, [1, 2, 3])).toEqual([1, 2, 3]);
    expect(deepMergeOne({ a: 1 }, "replaced")).toEqual("replaced");
    expect(deepMergeOne({ a: 1 }, null)).toEqual(null);
  });

  it("merges plain objects key-by-key, preferring incoming scalars", () => {
    const merged = deepMergeOne({ a: 1, b: 2, c: 3 }, { b: 20, d: 40 });
    expect(merged).toEqual({ a: 1, b: 20, c: 3, d: 40 });
  });

  it("recurses into nested plain objects", () => {
    const merged = deepMergeOne(
      { outer: { inner: { x: 1, y: 2 } } },
      { outer: { inner: { y: 20 } } },
    );
    expect(merged).toEqual({ outer: { inner: { x: 1, y: 20 } } });
  });

  it("drops functions on incoming so action methods are never overwritten", () => {
    const baseFn = () => "base";
    const incomingFn = () => "incoming";
    const merged = deepMergeOne(
      { fn: baseFn, value: 1 },
      { fn: incomingFn, value: 2 },
    );
    expect((merged as { fn: () => string }).fn).toBe(baseFn);
    expect((merged as { value: number }).value).toBe(2);
  });

  it("does not mutate the base object", () => {
    const base = { outer: { inner: { x: 1 } } };
    deepMergeOne(base, { outer: { inner: { y: 2 } } });
    expect(base).toEqual({ outer: { inner: { x: 1 } } });
  });
});

describe("buildPersistMerge", () => {
  type FakeState = {
    gamePath: string;
    proxyConfig: { enabled: boolean; host: string; port: number };
    profiles: Record<string, { id: string; mods: string[] }>;
    setGamePath: (p: string) => void;
  };

  const defaults: FakeState = {
    gamePath: "",
    proxyConfig: { enabled: false, host: "", port: 8080 },
    profiles: { default: { id: "default", mods: [] } },
    setGamePath: () => {},
  };

  it("returns current when persisted is not a plain object", () => {
    const merge = buildPersistMerge(new Set(["proxyConfig"]));
    expect(merge(null, defaults as never)).toBe(defaults as never);
    expect(merge("garbage", defaults as never)).toBe(defaults as never);
  });

  it("takes non-deep keys from persisted as-is (zustand default behavior)", () => {
    const merge = buildPersistMerge(new Set(["proxyConfig"]));
    const persisted = {
      gamePath: "/games/deadlock",
      profiles: { custom: { id: "custom", mods: ["a", "b"] } },
    };
    const merged = merge(persisted, defaults as never) as unknown as FakeState;
    expect(merged.gamePath).toBe("/games/deadlock");
    // profiles is shallow-replaced (no `default` survives), proving user-keyed
    // records aren't accidentally deep-merged.
    expect(merged.profiles).toEqual({
      custom: { id: "custom", mods: ["a", "b"] },
    });
  });

  it("deep-merges opted-in nested objects so new defaults survive", () => {
    const merge = buildPersistMerge(new Set(["proxyConfig"]));
    // Simulate a persisted state from before `port` was added to proxyConfig.
    const persisted = {
      gamePath: "",
      proxyConfig: { enabled: true, host: "10.0.0.1" },
    };
    const merged = merge(persisted, defaults as never) as unknown as FakeState;
    expect(merged.proxyConfig).toEqual({
      enabled: true,
      host: "10.0.0.1",
      port: 8080, // picked up from defaults
    });
  });

  it("drops incoming function values so action methods are never overwritten", () => {
    const merge = buildPersistMerge(new Set(["proxyConfig"]));
    const fakeAction = () => "evil";
    const persisted = {
      gamePath: "/x",
      setGamePath: fakeAction,
    };
    const merged = merge(persisted, defaults as never) as unknown as FakeState;
    expect(merged.setGamePath).toBe(defaults.setGamePath);
  });

  it("handles missing nested object on persisted by keeping default", () => {
    const merge = buildPersistMerge(new Set(["proxyConfig"]));
    const persisted = { gamePath: "/x" };
    const merged = merge(persisted, defaults as never) as unknown as FakeState;
    expect(merged.proxyConfig).toEqual(defaults.proxyConfig);
  });
});
