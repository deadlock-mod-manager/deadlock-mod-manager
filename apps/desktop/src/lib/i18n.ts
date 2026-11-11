/** biome-ignore-all lint/style/noExportedImports: Allowed for i18n */
import i18n, { type BackendModule } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import enTranslation from "@/locales/en.json" with { type: "json" };
import { localeLoaders } from "@/lib/locale-loaders";

const LANGUAGE_STORAGE_KEY = "i18nextLng";

// Migrate users who saved a short language code (e.g. "fr") before the
// BCP-47 rename (e.g. "fr-FR"). Runs once per page load before i18next reads
// localStorage via the detector.
const LEGACY_LANGUAGE_MIGRATION: Record<string, string> = {
  fr: "fr-FR",
  ar: "ar-SA",
  ja: "ja-JP",
  ko: "ko-KR",
  de: "de-DE",
  es: "es-ES",
  it: "it-IT",
  ru: "ru-RU",
  pl: "pl-PL",
  tr: "tr-TR",
  th: "th-TH",
  bg: "bg-BG",
  be: "be-BY",
  gsw: "de-CH",
  "gsw-CH": "de-CH",
};

if (typeof localStorage !== "undefined") {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored && LEGACY_LANGUAGE_MIGRATION[stored]) {
    localStorage.setItem(
      LANGUAGE_STORAGE_KEY,
      LEGACY_LANGUAGE_MIGRATION[stored],
    );
  }
}

// English is the fallback for every missing key, so it ships in the entry
// chunk; i18next asks this backend for any other language before switching.
const localeBackend: BackendModule = {
  type: "backend",
  init: () => {},
  read: (language, _namespace, callback) => {
    localeLoaders[language]().then(
      (module) => callback(null, module.default),
      (error: Error) => callback(error, false),
    );
  },
};

// Rendering waits for the detected language, so it shows from the first frame.
// eslint-disable-next-line import/no-named-as-default-member
await i18n
  .use(LanguageDetector)
  .use(localeBackend)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: enTranslation } },
    partialBundledLanguages: true,
    fallbackLng: "en",
    returnEmptyString: false,
    supportedLngs: ["en", ...Object.keys(localeLoaders)],
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
    },
  });

export default i18n;
