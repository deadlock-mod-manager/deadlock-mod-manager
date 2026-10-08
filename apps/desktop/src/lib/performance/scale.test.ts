import { describe, expect, test } from "bun:test";
import { tierForScore, tierInfo, tierLevel } from "./scale";

describe("tierForScore", () => {
  test("maps the ends of the scale to the end tiers", () => {
    expect(tierForScore(0).id).toBe("pretty");
    expect(tierForScore(1).id).toBe("potato");
  });

  test("picks the closest stop", () => {
    expect(tierForScore(0.32).id).toBe("balanced");
    expect(tierForScore(0.66).id).toBe("sweaty");
  });

  test("clamps scores outside 0..1", () => {
    expect(tierForScore(-3).id).toBe("pretty");
    expect(tierForScore(7).id).toBe("potato");
  });
});

describe("tier helpers", () => {
  test("levels run from 1 to 5", () => {
    expect(tierLevel("pretty")).toBe(1);
    expect(tierLevel("potato")).toBe(5);
  });

  test("every tier has an emoji", () => {
    expect(tierInfo("lean").emoji).toBe("⚡");
  });
});
