import { describe, expect, it } from "vitest";
import { policyManifestSchema } from "../schemas/policy.schemas";

describe("policyManifestSchema", () => {
  it("accepts a versioned identity policy manifest", () => {
    expect(
      policyManifestSchema.parse({
        version: 1,
        revision: 42,
        generatedAt: "2026-08-30T12:00:00.000Z",
        rules: [
          {
            provider: "gamebanana",
            submissionType: "sound",
            submissionId: "7",
            kind: "blacklisted",
            reason: "malware",
            correction: null,
            updatedAt: "2026-08-30T11:59:00.000Z",
          },
        ],
      }).rules[0]?.submissionType,
    ).toBe("sound");
  });

  it("rejects malformed identities and unsupported schema versions", () => {
    expect(
      policyManifestSchema.safeParse({
        version: 2,
        revision: 1,
        generatedAt: "2026-08-30T12:00:00.000Z",
        rules: [],
      }).success,
    ).toBe(false);
    expect(
      policyManifestSchema.safeParse({
        version: 1,
        revision: 1,
        generatedAt: "2026-08-30T12:00:00.000Z",
        rules: [
          {
            provider: "gamebanana",
            submissionType: "mod",
            submissionId: "../7",
            kind: "hidden",
            reason: null,
            correction: null,
            updatedAt: "2026-08-30T12:00:00.000Z",
          },
        ],
      }).success,
    ).toBe(false);
  });
});
