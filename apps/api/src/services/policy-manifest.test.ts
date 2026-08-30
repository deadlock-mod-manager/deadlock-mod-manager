import { describe, expect, it } from "bun:test";
import type { PolicyRule } from "@deadlock-mods/database";
import { policyRulesToManifest } from "./policy-manifest-builder";

const rule = (updatedAt: Date): PolicyRule => ({
  id: "policy_rule_test",
  provider: "gamebanana",
  submissionType: "sound",
  submissionId: "42",
  kind: "blacklisted",
  active: true,
  reason: "unsafe",
  correction: null,
  createdBy: "moderator",
  createdAt: new Date("2026-08-29T12:00:00Z"),
  updatedAt,
});

describe("policyRulesToManifest", () => {
  it("uses the latest database update as a stable revision", () => {
    const manifest = policyRulesToManifest(
      [
        rule(new Date("2026-08-30T10:00:00Z")),
        { ...rule(new Date("2026-08-30T12:00:00Z")), submissionId: "43" },
      ],
      new Date("2026-08-30T13:00:00Z"),
    );

    expect(manifest.version).toBe(1);
    expect(manifest.revision).toBe(new Date("2026-08-30T12:00:00Z").getTime());
    expect(manifest.generatedAt).toBe("2026-08-30T13:00:00.000Z");
    expect(manifest.rules).toHaveLength(2);
  });

  it("advances the revision but omits deactivated rules", () => {
    const removed = {
      ...rule(new Date("2026-08-30T14:00:00Z")),
      active: false,
    };
    const manifest = policyRulesToManifest([removed]);

    expect(manifest.revision).toBe(new Date("2026-08-30T14:00:00Z").getTime());
    expect(manifest.rules).toEqual([]);
  });
});
