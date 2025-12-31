import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { getCookieDomain } from "@/lib/config";
import arTranslation from "@/locales/ar/translation.json" with { type: "json" };
import deTranslation from "@/locales/de/translation.json" with { type: "json" };
import enTranslation from "@/locales/en/translation.json" with { type: "json" };
import esTranslation from "@/locales/es/translation.json" with { type: "json" };
import frTranslation from "@/locales/fr/translation.json" with { type: "json" };
import gswTranslation from "@/locales/gsw/translation.json" with {
  type: "json",
};
import itTranslation from "@/locales/it/translation.json" with { type: "json" };
import jaTranslation from "@/locales/ja/translation.json" with { type: "json" };
import plTranslation from "@/locales/pl/translation.json" with { type: "json" };
import ptBRTranslation from "@/locales/pt-BR/translation.json" with {
  type: "json",
};
import ruTranslation from "@/locales/ru/translation.json" with { type: "json" };
import thTranslation from "@/locales/th/translation.json" with { type: "json" };
import trTranslation from "@/locales/tr/translation.json" with { type: "json" };
import zhCNTranslation from "@/locales/zh-CN/translation.json" with {
  type: "json",
};
import zhTWTranslation from "@/locales/zh-TW/translation.json" with {
  type: "json",
};

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
};

export const supportedLanguages = [
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
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

export const languages = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "ar", name: "العربية", flag: "🇸🇦" },
  { code: "pl", name: "Polski", flag: "🇵🇱" },
  { code: "gsw", name: "Schweizerdeutsch", flag: "🇨🇭" },
  { code: "th", name: "ไทย", flag: "🇹🇭" },
  { code: "tr", name: "Türkçe", flag: "🇹🇷" },
  { code: "ru", name: "Русский", flag: "🇷🇺" },
  { code: "zh-CN", name: "简体中文", flag: "🇨🇳" },
  { code: "zh-TW", name: "繁體中文", flag: "🇹🇼" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "pt-BR", name: "Português (Brasil)", flag: "🇧🇷" },
  { code: "it", name: "Italiano", flag: "🇮🇹" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
] as const;

const cookieDomain = getCookieDomain();

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: supportedLanguages,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["cookie", "navigator"],
      caches: ["cookie"],
      cookieMinutes: 525600, // 1 year
      lookupCookie: "i18next",
      cookieDomain,
    },
  });

export default i18n;
