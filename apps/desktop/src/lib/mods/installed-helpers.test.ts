import { describe, expect, it } from "bun:test";
import { isLocalMod } from "./installed-helpers";

describe("isLocalMod", () => {
  it("uses the canonical slug grammar", () => {
    expect(
      isLocalMod({
        remoteId: "local-550e8400-e29b-41d4-a716-446655440000",
      }),
    ).toBe(true);
    expect(isLocalMod({ remoteId: "123" })).toBe(false);
    expect(isLocalMod({ remoteId: "snd-123" })).toBe(false);
    expect(isLocalMod({ remoteId: "local-" })).toBe(false);
    expect(isLocalMod({ remoteId: "local-a_b" })).toBe(false);
    expect(isLocalMod({ remoteId: "local-abc-123" })).toBe(false);
  });
});
