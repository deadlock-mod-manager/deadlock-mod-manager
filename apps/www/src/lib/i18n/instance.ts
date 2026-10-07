import {
  createInstance,
  type i18n,
  type Resource,
  type ResourceKey,
} from "i18next";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "./locales";

/**
 * One JSON file per namespace and locale: src/locales/<file>/<namespace>.json.
 * English is the source Crowdin translates from; missing or empty keys in
 * other locales fall back to it.
 */
export const NAMESPACES = [
  "common",
  "home",
  "preview",
  "download",
  "tool-randomizer",
  "tool-crosshair",
  "tool-vpk",
  "tool-kv",
  "guide-mods",
  "guide-skins",
  "guide-install",
  "guide-not-working",
  "guide-grimoire",
  "error-os-5",
  "error-os-740",
  "error-mod-order",
  "error-download",
  "error-fatal",
] as const;

export type Namespace = (typeof NAMESPACES)[number];

const files = import.meta.glob<ResourceKey>("../../locales/*/*.json", {
  eager: true,
  import: "default",
});

const resources: Resource = {};
for (const [file, content] of Object.entries(files)) {
  const [, folder = "", name = ""] =
    file.match(/locales\/([^/]+)\/([^/]+)\.json$/) ?? [];
  const locale = LOCALES.find((entry) => entry.file === folder);
  if (!locale) continue;
  resources[locale.id] ??= {};
  resources[locale.id][name] = content;
}

/**
 * A fresh i18next instance per router, so concurrent server renders never
 * share a language. Resources are bundled, so init is synchronous.
 */
export const createI18n = (locale: Locale = DEFAULT_LOCALE): i18n => {
  const instance = createInstance();
  instance.init({
    resources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: LOCALES.map((entry) => entry.id),
    ns: NAMESPACES,
    defaultNS: "common",
    // Crowdin writes untranslated strings as "", which should fall back to English.
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    initAsync: false,
    react: { useSuspense: false },
  });
  return instance;
};
