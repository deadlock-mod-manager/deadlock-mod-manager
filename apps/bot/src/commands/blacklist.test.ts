import { describe, expect, it } from "bun:test";
import { parsePolicyIdentity } from "../lib/policy-identity";

describe("parsePolicyIdentity", () => {
  it("treats a bare legacy ID as a GameBanana mod", () => {
    expect(parsePolicyIdentity("42")).toEqual({
      provider: "gamebanana",
      submissionType: "mod",
      submissionId: "42",
    });
  });

  it("accepts the canonical sound slug", () => {
    expect(parsePolicyIdentity("snd-42")).toEqual({
      provider: "gamebanana",
      submissionType: "sound",
      submissionId: "42",
    });
  });

  it("accepts both GameBanana mod and sound URLs", () => {
    expect(parsePolicyIdentity("https://gamebanana.com/mods/42")).toMatchObject(
      {
        submissionType: "mod",
        submissionId: "42",
      },
    );
    expect(
      parsePolicyIdentity("https://gamebanana.com/sounds/42"),
    ).toMatchObject({ submissionType: "sound", submissionId: "42" });
  });

  it("rejects lookalike hosts, insecure URLs, and unknown namespaces", () => {
    expect(() =>
      parsePolicyIdentity("https://gamebanana.com.evil.test/mods/42"),
    ).toThrow();
    expect(() =>
      parsePolicyIdentity("http://gamebanana.com/mods/42"),
    ).toThrow();
    expect(() =>
      parsePolicyIdentity("https://gamebanana.com/maps/42"),
    ).toThrow();
  });
});
