import { describe, expect, test } from "bun:test";
import { pickStable } from "./stable-pick";

describe("pickStable", () => {
  const heroes = ["Haze", "Yamato", "Ivy"];

  test("returns the same item for the same seed", () => {
    expect(pickStable(heroes, "KidoKash")).toBe(pickStable(heroes, "KidoKash"));
  });

  test("picks from the list", () => {
    expect(heroes).toContain(pickStable(heroes, "Braaiaa"));
  });

  test("returns undefined for an empty list", () => {
    expect(pickStable([], "KidoKash")).toBeUndefined();
  });
});
