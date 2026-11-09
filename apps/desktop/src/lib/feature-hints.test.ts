import { describe, expect, it } from "bun:test";
import {
  canShowHint,
  DEFAULT_FEATURE_HINTS_PROGRESS,
  type FeatureHintId,
  type FeatureHintsProgress,
  getFeatureHint,
  hintPriority,
} from "./feature-hints";
import en from "@/locales/en.json";

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

const discoveryHints: FeatureHintId[] = [
  "performance-configs",
  "custom-mod-sources",
  "randomized-groups",
  "party-planner",
  "server-picker",
  "foundry",
  "analyze-local-mods",
];

describe("new feature discovery", () => {
  it("provides translated titles and explanations for every new hint", () => {
    for (const id of discoveryHints) {
      const copy = en.featureHints[getFeatureHint(id).i18nKey];
      expect(copy.title.trim().length).toBeGreaterThan(0);
      expect(copy.body.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps new hints subject to quiet time, usage, dismissal and opt-out", () => {
    for (const id of discoveryHints) {
      const eligible = progress({ firstSeenAt: { [id]: NOW - 30 * DAY } });
      expect(canShowHint(id, eligible, NOW)).toBe(true);
      expect(canShowHint(id, { ...eligible, startedAt: NOW - HOUR }, NOW)).toBe(
        false,
      );
      expect(canShowHint(id, { ...eligible, used: { [id]: true } }, NOW)).toBe(
        false,
      );
      expect(
        canShowHint(id, { ...eligible, retired: { [id]: true } }, NOW),
      ).toBe(false);
      expect(canShowHint(id, { ...eligible, enabled: false }, NOW)).toBe(false);
      expect(canShowHint(id, { ...eligible, firstSeenAt: {} }, NOW)).toBe(
        false,
      );
    }
  });

  it("prioritizes contextual actions over sidebar discovery", () => {
    for (const local of [
      "custom-mod-sources",
      "randomized-groups",
      "party-planner",
      "analyze-local-mods",
    ] satisfies FeatureHintId[]) {
      for (const sidebar of [
        "performance-configs",
        "server-picker",
        "foundry",
      ] satisfies FeatureHintId[]) {
        expect(hintPriority(local)).toBeLessThan(hintPriority(sidebar));
      }
    }
  });
});
