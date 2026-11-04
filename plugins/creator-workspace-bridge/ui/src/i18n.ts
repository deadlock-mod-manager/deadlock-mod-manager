import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json" with { type: "json" };

// oxlint-disable-next-line import/no-named-as-default-member
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: navigator.language,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
