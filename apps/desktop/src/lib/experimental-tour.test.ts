import { describe, expect, it } from "bun:test";
import { enableTourFeatures } from "./experimental-tour";
import type { ExperimentalFeature } from "./store/slices/ui";

const current = {
  "server-browser": false,
  "custom-maps": true,
  "performance-configs": false,
  "mod-foundry": false,
  "player-stats": true,
  "profile-management": true,
  "profile-sharing": true,
  "conflict-detection": true,
} satisfies Record<ExperimentalFeature, boolean>;

describe("tour opt-in", () => {
  it("leaves every setting unchanged when no features are selected", () => {
    expect(enableTourFeatures(current, [])).toEqual(current);
  });
  it("enables only selected features while preserving existing choices", () => {
    const result = enableTourFeatures(current, ["server-browser"]);
    expect(result).toEqual({ ...current, "server-browser": true });
    expect(current["server-browser"]).toBe(false);
    expect(result["custom-maps"]).toBe(true);
    expect(result["mod-foundry"]).toBe(false);
  });
});
