/** biome-ignore-all lint/style/noExportedImports: Allowed for i18n */
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import arSATranslation from "@/locales/ar-SA.json" with { type: "json" };
import bgBGTranslation from "@/locales/bg-BG.json" with { type: "json" };
import deDETranslation from "@/locales/de-DE.json" with { type: "json" };
import enTranslation from "@/locales/en.json" with { type: "json" };
import esESTranslation from "@/locales/es-ES.json" with { type: "json" };
import frFRTranslation from "@/locales/fr-FR.json" with { type: "json" };
import deCHTranslation from "@/locales/de-CH.json" with { type: "json" };
import itITTranslation from "@/locales/it-IT.json" with { type: "json" };
import jaJPTranslation from "@/locales/ja-JP.json" with { type: "json" };
import koKRTranslation from "@/locales/ko-KR.json" with { type: "json" };
import plPLTranslation from "@/locales/pl-PL.json" with { type: "json" };
import ptBRTranslation from "@/locales/pt-BR.json" with { type: "json" };
import ruRUTranslation from "@/locales/ru-RU.json" with { type: "json" };
import thTHTranslation from "@/locales/th-TH.json" with { type: "json" };
import trTRTranslation from "@/locales/tr-TR.json" with { type: "json" };
import zhCNTranslation from "@/locales/zh-CN.json" with { type: "json" };
import zhTWTranslation from "@/locales/zh-TW.json" with { type: "json" };

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

const resources = {
  en: {
    translation: enTranslation,
  },
  "de-DE": {
    translation: deDETranslation,
  },
  "fr-FR": {
    translation: frFRTranslation,
  },
  "ar-SA": {
    translation: arSATranslation,
  },
  "de-CH": {
    translation: deCHTranslation,
  },
  "pl-PL": {
    translation: plPLTranslation,
  },
  "th-TH": {
    translation: thTHTranslation,
  },
  "tr-TR": {
    translation: trTRTranslation,
  },
  "ru-RU": {
    translation: ruRUTranslation,
  },
  "zh-CN": {
    translation: zhCNTranslation,
  },
  "zh-TW": {
    translation: zhTWTranslation,
  },
  "es-ES": {
    translation: esESTranslation,
  },
  "pt-BR": {
    translation: ptBRTranslation,
  },
  "it-IT": {
    translation: itITTranslation,
  },
  "ja-JP": {
    translation: jaJPTranslation,
  },
  "ko-KR": {
    translation: koKRTranslation,
  },
  "bg-BG": {
    translation: bgBGTranslation,
  },
};

// eslint-disable-next-line import/no-named-as-default-member
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    returnEmptyString: false,
    supportedLngs: [
      "en",
      "de-DE",
      "fr-FR",
      "ar-SA",
      "pl-PL",
      "de-CH",
      "th-TH",
      "tr-TR",
      "ru-RU",
      "zh-CN",
      "zh-TW",
      "es-ES",
      "pt-BR",
      "it-IT",
      "ja-JP",
      "ko-KR",
      "bg-BG",
    ],
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
    },
  });

export default i18n;
