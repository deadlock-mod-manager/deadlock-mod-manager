import { describe, expect, it } from "bun:test";
import { enableTourFeatures } from "./experimental-tour";
import type { ExperimentalFeature } from "./store/slices/ui";

const current = {
  "custom-maps": false,
  "performance-configs": false,
  "mod-foundry": false,
  "player-stats": true,
  "profile-management": true,
  "profile-sharing": true,
  "conflict-detection": true,
  "cloud-backup": false,
  plugins: false,
  "live-scoreboard": false,
} satisfies Record<ExperimentalFeature, boolean>;

describe("tour opt-in", () => {
  it("leaves every setting unchanged when no features are selected", () => {
    expect(enableTourFeatures(current, [])).toEqual(current);
  });
  it("enables only selected features while preserving existing choices", () => {
    const result = enableTourFeatures(current, ["custom-maps"]);
    expect(result).toEqual({ ...current, "custom-maps": true });
    expect(current["custom-maps"]).toBe(false);
    expect(result["player-stats"]).toBe(true);
    expect(result["mod-foundry"]).toBe(false);
  });
});
