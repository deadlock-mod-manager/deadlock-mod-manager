import { describe, expect, it } from "bun:test";
import { createInstance } from "i18next";
import enTranslation from "@/locales/en.json" with { type: "json" };
import { getWhatsNewContent } from "./whats-new-versions";

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
    });
  });

  it("keeps the title and features for a release in the locale catalog", () => {
    expect(getWhatsNewContent(translations, "1.1.0")).toEqual({
      title: enTranslation.whatsNew.versions["1.1.0"].title,
      features: enTranslation.whatsNew.versions["1.1.0"].features,
    });
  });

  for (const version of ["1.2.0-nightly.20260825.db775912", "99.0.0"]) {
    it(`uses the localized generic heading for missing release ${version}`, () => {
      expect(getWhatsNewContent(translations, version)).toEqual({
        title: enTranslation.whatsNew.title,
        features: [],
      });
    });
  }
});
