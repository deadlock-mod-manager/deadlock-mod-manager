import { describe, expect, it } from "bun:test";
import { createInstance } from "i18next";
import enTranslation from "@/locales/en.json" with { type: "json" };
import {
  getSkippedWhatsNewVersions,
  getWhatsNewContent,
} from "./whats-new-versions";

const translations = createInstance();
await translations.init({
  lng: "en",
  fallbackLng: "en",
  returnEmptyString: false,
  resources: { en: { translation: enTranslation } },
});

describe("What's New release content", () => {
  it("uses the localized generic heading when only English has release notes", async () => {
    const localized = createInstance();
    await localized.init({
      lng: "fr-FR",
      fallbackLng: "en",
      returnEmptyString: false,
      resources: {
        en: { translation: enTranslation },
        "fr-FR": {
          translation: { whatsNew: { title: "Nouveautés" } },
        },
      },
    });

    expect(getWhatsNewContent(localized, "1.1.0")).toEqual({
      title: "Nouveautés",
      features: [],
      highlights: [],
    });
  });

  it("keeps the title and features for a release in the locale catalog", () => {
    expect(getWhatsNewContent(translations, "1.1.0")).toEqual({
      title: enTranslation.whatsNew.versions["1.1.0"].title,
      features: enTranslation.whatsNew.versions["1.1.0"].features,
      highlights: [],
    });
  });

  for (const version of ["1.2.0-nightly.20260825.db775912", "99.0.0"]) {
    it(`uses the localized generic heading for missing release ${version}`, () => {
      expect(getWhatsNewContent(translations, version)).toEqual({
        title: enTranslation.whatsNew.title,
        features: [],
        highlights: [],
      });
    });
  }
});

describe("skipped releases", () => {
  it("lists only the releases between the last seen and current version", () => {
    expect(getSkippedWhatsNewVersions("2.1.0", "2.3.0")).toEqual([
      "2.2.0",
      "2.1.1",
    ]);
  });

  it("lists nothing for an adjacent or unknown last seen version", () => {
    expect(getSkippedWhatsNewVersions("2.2.0", "2.3.0")).toEqual([]);
    expect(getSkippedWhatsNewVersions("2.3.0-nightly.1", "2.3.0")).toEqual([]);
  });
});
