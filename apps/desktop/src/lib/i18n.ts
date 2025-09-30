/** biome-ignore-all lint/style/noExportedImports: Allowed for i18n */
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import arTranslation from "@/locales/ar/translation.json" with { type: "json" };
import deTranslation from "@/locales/de/translation.json" with { type: "json" };
import enTranslation from "@/locales/en/translation.json" with { type: "json" };
import frTranslation from "@/locales/fr/translation.json" with { type: "json" };
import gswTranslation from "@/locales/gsw/translation.json" with {
  type: "json",
};
import plTranslation from "@/locales/pl/translation.json" with { type: "json" };
import ruTranslation from "@/locales/ru/translation.json" with { type: "json" };
import trTranslation from "@/locales/tr/translation.json" with { type: "json" };
import zhCNTranslation from "@/locales/zh-CN/translation.json" with {
  type: "json",
};
import heTranslation from "@/locales/he/translation.json" with { type: "json" };

const resources = {
  en: {
    translation: enTranslation,
  },
  de: {
    translation: deTranslation,
  },
  fr: {
    translation: frTranslation,
  },
  ar: {
    translation: arTranslation,
  },
  gsw: {
    translation: gswTranslation,
  },
  pl: {
    translation: plTranslation,
  },
  tr: {
    translation: trTranslation,
  },
  ru: {
    translation: ruTranslation,
  },
  "zh-CN": {
    translation: zhCNTranslation,
  },
  he: {
    translation: heTranslation,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: ["en", "de", "fr", "ar", "pl", "gsw", "tr", "ru", "zh-CN", "he"],
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
    },
  });

export default i18n;
