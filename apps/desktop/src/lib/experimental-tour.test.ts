import { describe, expect, it } from "bun:test";
import { enableTourFeatures } from "./experimental-tour";
import type { ExperimentalFeature } from "./store/slices/ui";

const current = {
  "custom-maps": false,
  "performance-configs": false,
  "mod-foundry": false,
  "profile-management": true,
  "profile-sharing": true,
  "conflict-detection": true,
  "cloud-backup": false,
  plugins: false,
} satisfies Record<ExperimentalFeature, boolean>;

describe("tour opt-in", () => {
  it("leaves every setting unchanged when no features are selected", () => {
    expect(enableTourFeatures(current, [])).toEqual(current);
  });
  it("enables only selected features while preserving existing choices", () => {
    const result = enableTourFeatures(current, ["custom-maps"]);
    expect(result).toEqual({ ...current, "custom-maps": true });
    expect(current["custom-maps"]).toBe(false);
    expect(result["profile-management"]).toBe(true);
    expect(result["mod-foundry"]).toBe(false);
  });
});
