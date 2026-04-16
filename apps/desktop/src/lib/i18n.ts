/** biome-ignore-all lint/style/noExportedImports: Allowed for i18n */
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import arTranslation from "@/locales/ar.json" with { type: "json" };
import bgTranslation from "@/locales/bg.json" with { type: "json" };
import deTranslation from "@/locales/de.json" with { type: "json" };
import enTranslation from "@/locales/en.json" with { type: "json" };
import esTranslation from "@/locales/es.json" with { type: "json" };
import frTranslation from "@/locales/fr.json" with { type: "json" };
import gswTranslation from "@/locales/gsw.json" with { type: "json" };
import itTranslation from "@/locales/it.json" with { type: "json" };
import jaTranslation from "@/locales/ja.json" with { type: "json" };
import koTranslation from "@/locales/ko.json" with { type: "json" };
import plTranslation from "@/locales/pl.json" with { type: "json" };
import ptBRTranslation from "@/locales/pt-BR.json" with { type: "json" };
import ruTranslation from "@/locales/ru.json" with { type: "json" };
import thTranslation from "@/locales/th.json" with { type: "json" };
import trTranslation from "@/locales/tr.json" with { type: "json" };
import zhCNTranslation from "@/locales/zh-CN.json" with { type: "json" };
import zhTWTranslation from "@/locales/zh-TW.json" with { type: "json" };

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
  th: {
    translation: thTranslation,
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
  "zh-TW": {
    translation: zhTWTranslation,
  },
  es: {
    translation: esTranslation,
  },
  "pt-BR": {
    translation: ptBRTranslation,
  },
  it: {
    translation: itTranslation,
  },
  ja: {
    translation: jaTranslation,
  },
  ko: {
    translation: koTranslation,
  },
  bg: {
    translation: bgTranslation,
  },
};

// eslint-disable-next-line import/no-named-as-default-member
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: [
      "en",
      "de",
      "fr",
      "ar",
      "pl",
      "gsw",
      "th",
      "tr",
      "ru",
      "zh-CN",
      "zh-TW",
      "es",
      "pt-BR",
      "it",
      "ja",
      "ko",
      "bg",
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
