import { describe, expect, it } from "bun:test";
import {
  canShowHint,
  DEFAULT_FEATURE_HINTS_PROGRESS,
  type FeatureHintsProgress,
} from "./feature-hints";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = 100 * DAY;

const progress = (
  values: Partial<FeatureHintsProgress> = {},
): FeatureHintsProgress => ({
  ...DEFAULT_FEATURE_HINTS_PROGRESS,
  startedAt: NOW - 30 * DAY,
  firstSeenAt: { "my-mods-menu": NOW - 30 * DAY },
  ...values,
});

describe("canShowHint", () => {
  it("shows a hint whose control has been ignored long enough", () => {
    expect(canShowHint("my-mods-menu", progress(), NOW)).toBe(true);
  });

  it("waits out the first hours after onboarding", () => {
    expect(
      canShowHint("my-mods-menu", progress({ startedAt: NOW - HOUR }), NOW),
    ).toBe(false);
  });

  it("waits until the control has been on screen for the hint's delay", () => {
    expect(
      canShowHint(
        "my-mods-menu",
        progress({ firstSeenAt: { "my-mods-menu": NOW - HOUR } }),
        NOW,
      ),
    ).toBe(false);
  });

  it("never shows once tips are off, the feature is used, or it is retired", () => {
    expect(canShowHint("my-mods-menu", progress({ enabled: false }), NOW)).toBe(
      false,
    );
    expect(
      canShowHint(
        "my-mods-menu",
        progress({ used: { "my-mods-menu": true } }),
        NOW,
      ),
    ).toBe(false);
    expect(
      canShowHint(
        "my-mods-menu",
        progress({ retired: { "my-mods-menu": true } }),
        NOW,
      ),
    ).toBe(false);
  });
});
