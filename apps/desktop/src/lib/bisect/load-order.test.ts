import { describe, expect, it } from "bun:test";
import type { VpkManifestEntry } from "@/types/profiles";
import { loadOrderOf, sortByLoadOrder } from "./load-order";

const entry = (
  shard: number,
  currentVpks: string[],
  enabled = true,
): VpkManifestEntry => ({
  enabled,
  order: null,
  shard,
  currentVpks,
  disabledVpks: [],
  originalVpkNames: [],
});

describe("bisect load order", () => {
  it("reads the order from shards and pak numbers, not names", () => {
    const order = loadOrderOf({
      version: 1,
      mods: {
        late: entry(2, ["pak01_dir.vpk"]),
        tenth: entry(1, ["pak10_dir.vpk"]),
        ninth: entry(1, ["pak09_dir.vpk"]),
        multi: entry(1, ["pak12_dir.vpk", "pak03_dir.vpk"]),
        off: entry(1, [], false),
      },
    });
    expect(order).toEqual(["multi", "ninth", "tenth", "late"]);
  });

  it("puts mods without a recorded place last", () => {
    expect(sortByLoadOrder(["new", "b", "a"], ["a", "b"])).toEqual([
      "a",
      "b",
      "new",
    ]);
  });
});
