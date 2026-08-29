import { describe, expect, it } from "bun:test";
import {
  getWhatsNewFeaturesKey,
  getWhatsNewTitleKey,
} from "./whats-new-versions";

describe("What's New version content", () => {
  it("uses exact localized content for a cataloged stable version", () => {
    expect(getWhatsNewTitleKey("1.1.0")).toBe("whatsNew.versions.1.1.0.title");
    expect(getWhatsNewFeaturesKey("1.1.0")).toBe(
      "whatsNew.versions.1.1.0.features",
    );
  });

  it("uses the generic title and no features for an uncataloged nightly", () => {
    const nightlyVersion = "1.2.0-nightly.20260825.db775912";

    expect(getWhatsNewTitleKey(nightlyVersion)).toBe("whatsNew.title");
    expect(getWhatsNewFeaturesKey(nightlyVersion)).toBeNull();
  });
});
