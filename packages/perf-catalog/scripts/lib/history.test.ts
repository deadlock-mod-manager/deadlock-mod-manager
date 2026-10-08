import { describe, expect, it } from "bun:test";
import { type DumpVersion, statusSince } from "./history";

const dump = (
  build: number,
  convars: Record<string, string[]>,
): DumpVersion => ({
  build,
  convars: new Map(
    Object.entries(convars).map(([name, flags]) => [name, new Set(flags)]),
  ),
});

describe("statusSince", () => {
  it("dates a removal the history shows", () => {
    const history = [dump(1, { a: [] }), dump(2, { a: [] }), dump(3, {})];
    expect(statusSince("a", "removed", history)).toBe(3);
  });

  it("has no build for a name no dump ever had", () => {
    const history = [dump(1, {}), dump(2, {})];
    expect(statusSince("cubemapfog", "removed", history)).toBeNull();
  });

  it("dates the latest run of a block, not an earlier one", () => {
    const blocked = ["gameinfo_cannot_override"];
    const history = [
      dump(1, { a: [] }),
      dump(2, { a: blocked }),
      dump(3, { a: [] }),
      dump(4, { a: blocked }),
    ];
    expect(statusSince("a", "blocked", history)).toBe(4);
  });

  it("has no build when the oldest dump is already blocked", () => {
    const blocked = ["gameinfo_cannot_override"];
    const history = [dump(1, { a: blocked }), dump(2, { a: blocked })];
    expect(statusSince("a", "blocked", history)).toBeNull();
  });
});
